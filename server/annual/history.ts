import { createHash } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import type { PoolConnection } from 'mysql2/promise';
import type { TrpcContext } from '../_core/context';
import { annualRows, BASE_YEAR, getWorkspaceForScope, withAnnualBaseConnection, workspaceOnConnection } from './store';
import type { AnnualWorkspaceRecord } from './store';
import { namespaceTable, quoteIdentifier } from './manifest';
import { canAccessProcess, hydrateTeamAccessPolicy, type TeamAccessPolicy } from '../_core/teamAccessPolicy';

export const HISTORICAL_SOURCE_TABLES = ['linkedCommitments', 'programActions', 'operationalFindings'] as const;
export type HistoricalSourceTable = typeof HISTORICAL_SOURCE_TABLES[number];
export const HISTORICAL_ID_PATTERN = /^ah1_[a-f0-9]{64}$/;
export interface HistoricalItem {
  id: string; sourceYear: number; sourceWorkspaceId: number;
  kind: 'program_action' | 'inspection_finding'; sourceTable: string; sourceId: number;
  processId: number | null; title: string; dueDate: string | null;
  status: 'pending' | 'completed'; notes: string; resolvedYear: number | null;
}
type Row = Record<string, any>;
type Identity = { workspaceId: number; table: HistoricalSourceTable; id: number };
type Version = Identity & { workspace: AnnualWorkspaceRecord; row: Row; kind: HistoricalItem['kind']; processId: number | null; backing?: Version };
type Access = { policy: TeamAccessPolicy; raw: boolean; processId: number | null; actor: { accountId: number; role: 'admin' | 'manager' | 'coordinator' | 'process_leader'; companyId: number; processId: number | null; name: string | null } };
function fail(code: 'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND' | 'PRECONDITION_FAILED', message: string): never { throw new TRPCError({ code, message }); }
function positive(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) fail('BAD_REQUEST', `${label} inválido`);
}
function validateInput(companyId: number, year: number, processId?: number) {
  positive(companyId, 'Empresa');
  if (!Number.isInteger(year) || year < BASE_YEAR || year > 2100) fail('BAD_REQUEST', 'Año anual inválido');
  if (processId !== undefined) positive(processId, 'Proceso');
}
function physical(w: AnnualWorkspaceRecord, table: string) { return quoteIdentifier(w.storage === 'base' ? table : namespaceTable(w.id, table)); }
function key(i: Identity) { return `${i.workspaceId}:${i.table}:${i.id}`; }
export function historicalObligationId(companyId: number, identity: Identity): string {
  positive(companyId, 'Empresa'); positive(identity.workspaceId, 'Espacio origen'); positive(identity.id, 'Registro origen');
  if (!HISTORICAL_SOURCE_TABLES.includes(identity.table)) fail('BAD_REQUEST', 'Tabla histórica no permitida');
  return 'ah1_' + createHash('sha256').update(`annual-history:v1:${companyId}:${key(identity)}`).digest('hex');
}
function dateValue(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

/** Never accept a role, actor, process or coordination flag supplied by input.
 * Recheck canonical active assignments, including a manager's account (the
 * legacy manager context has an email but no account ID). No annual snapshots
 * are used to authorize identities.
 */
async function accessOnConnection(c: PoolConnection, companyId: number, ctx: TrpcContext): Promise<Access> {
  const [company] = await annualRows(c, 'SELECT id FROM companies WHERE id=?', [companyId]);
  if (!company) fail('NOT_FOUND', 'Empresa no encontrada');
  const admin = ctx.user?.role === 'admin';
  const manager = !admin && ctx.manager?.companyId === companyId;
  const leader = !admin && !manager && ctx.processLeader?.companyId === companyId ? ctx.processLeader : null;
  if (!admin && !manager && !leader) fail('FORBIDDEN', 'No tiene acceso a esta empresa');
  const slug = admin ? 'platform_admin' : manager ? 'company_manager' : 'process_leader';
  const accountPredicate = manager ? 'a.email=?' : 'a.id=?';
  const accountValue = manager ? ctx.manager!.managerEmail : admin ? ctx.user!.id : leader!.processLeaderId;
  const roleCompany = admin ? 0 : companyId;
  const roleProcess = leader?.processId ?? 0;
  const assignments = await annualRows(c, `SELECT DISTINCT a.id,a.name FROM accounts a JOIN account_roles ar ON ar.accountId=a.id JOIN roles r ON r.id=ar.roleId WHERE ${accountPredicate} AND a.status='active' AND ar.status='active' AND r.slug=? AND ar.companyId=? AND ar.processId=?`, [accountValue, slug, roleCompany, roleProcess]);
  if (assignments.length !== 1) fail('FORBIDDEN', 'No existe una asignación activa inequívoca para la sesión');
  if (leader) {
    const [p] = await annualRows(c, 'SELECT id FROM processes WHERE id=? AND companyId=?', [leader.processId, companyId]);
    if (!p) fail('FORBIDDEN', 'El proceso real de la sesión no pertenece a la empresa');
  }
  // Direct service calls also rehydrate canonical grants, never historical
  // snapshots or a cached caller-supplied policy. SG denial leaves assigned
  // process obligations available but removes raw corporate history.
  const policy = await hydrateTeamAccessPolicy(ctx, companyId);
  if (!policy) fail('FORBIDDEN', 'No se pudo validar la política de accesos');
  // Preserve legacy raw-history authority: standard corporate read alone never
  // expands process history; explicit SIG management replaces coordination.
  return { policy, raw: policy.fullAccess || policy.moduleAccess.management_systems === 'write', processId: leader?.processId ?? null,
    actor: { accountId: Number(assignments[0].id), role: admin ? 'admin' : manager ? 'manager' : policy.moduleAccess.management_systems === 'write' ? 'coordinator' : 'process_leader', companyId, processId: leader?.processId ?? null, name: assignments[0].name ?? null } };
}

async function itemsOnConnection(c: PoolConnection, target: AnnualWorkspaceRecord, access: Access, processId?: number): Promise<{ items: HistoricalItem[]; sourceCompleted: Set<string> }> {
  if (processId !== undefined) {
    const [p] = await annualRows(c, `SELECT id FROM ${physical(target, 'processes')} WHERE id=? AND companyId=?`, [processId, target.companyId]);
    if (!p) fail('FORBIDDEN', 'El proceso no pertenece a la empresa y año solicitados');
    if (!canAccessProcess(access.policy, processId, 'read', target.companyId)) fail('FORBIDDEN', 'No tiene acceso a este proceso');
  }
  // Include the selected year only to reconcile already-completed copies.
  // Never inspect future workspace versions when rendering a historical year.
  const workspaceRows = await annualRows(c, "SELECT year FROM annualWorkspaces WHERE companyId=? AND year<=? AND status<>'preparing' ORDER BY year", [target.companyId, target.year]);
  const versions = new Map<string, Version>();
  const lineage = new Map<string, Row>();
  for (const wr of workspaceRows) {
    const w = await workspaceOnConnection(c, target.companyId, Number(wr.year));
    const actions = await annualRows(c, `SELECT a.* FROM ${physical(w, 'programActions')} a WHERE a.companyId=? ORDER BY a.id`, [w.companyId]);
    const findings = await annualRows(c, `SELECT f.* FROM ${physical(w, 'operationalFindings')} f WHERE f.companyId=? AND f.sourceType='inspection' ORDER BY f.id`, [w.companyId]);
    const links = await annualRows(c, `SELECT l.* FROM ${physical(w, 'linkedCommitments')} l WHERE l.companyId=? AND l.sourceType IN ('program_action','inspection_finding') ORDER BY l.id`, [w.companyId]);
    const programs = new Set((await annualRows(c, `SELECT id FROM ${physical(w, 'managementPrograms')} WHERE companyId=?`, [w.companyId])).map(r => Number(r.id)));
    const inspections = new Set((await annualRows(c, `SELECT id FROM ${physical(w, 'inspections')} WHERE companyId=?`, [w.companyId])).map(r => Number(r.id)));
    const processes = new Set((await annualRows(c, `SELECT id FROM ${physical(w, 'processes')} WHERE companyId=?`, [w.companyId])).map(r => Number(r.id)));
    for (const row of actions) {
      if (!programs.has(Number(row.programId))) fail('PRECONDITION_FAILED', 'Programa origen ajeno o inexistente');
      const v: Version = { workspaceId: w.id, table: 'programActions', id: Number(row.id), workspace: w, row, kind: 'program_action', processId: null };
      versions.set(key(v), v);
    }
    for (const row of findings) {
      if (!inspections.has(Number(row.sourceId))) fail('PRECONDITION_FAILED', 'Inspección origen ajena o inexistente');
      const v: Version = { workspaceId: w.id, table: 'operationalFindings', id: Number(row.id), workspace: w, row, kind: 'inspection_finding', processId: null };
      versions.set(key(v), v);
    }
    for (const row of links) {
      const sourceTable = row.sourceType === 'program_action' ? 'programActions' : 'operationalFindings';
      const sourceWorkspaceId = row.sourceWorkspaceId == null ? w.id : Number(row.sourceWorkspaceId);
      const backing = versions.get(key({ workspaceId: sourceWorkspaceId, table: sourceTable, id: Number(row.sourceId) }));
      if (row.sourceWorkspaceId != null && (!Number.isSafeInteger(sourceWorkspaceId) || sourceWorkspaceId <= 0 || !backing || backing.workspace.companyId !== target.companyId || backing.workspace.year >= w.year)) fail('PRECONDITION_FAILED', 'Fuente histórica explícita no corresponde a empresa/año anterior exacto');
      if (!processes.has(Number(row.processId)) || !backing || Number(row.sourceSubId) !== Number(sourceTable === 'programActions' ? backing.row.programId : backing.id)) fail('PRECONDITION_FAILED', 'Compromiso con proceso o fuente ajena/inválida');
      const v: Version = { workspaceId: w.id, table: 'linkedCommitments', id: Number(row.id), workspace: w, row, kind: row.sourceType, processId: Number(row.processId), backing };
      versions.set(key(v), v);
    }
    for (const l of await annualRows(c, "SELECT * FROM annualEntityLineage WHERE workspaceId=? AND tableName IN ('linkedCommitments','programActions','operationalFindings')", [w.id])) lineage.set(key({ workspaceId: w.id, table: l.tableName, id: Number(l.entityId) }), l);
  }
  const roots = new Map<string, Version>();
  function root(v: Version, seen = new Set<string>()): Version {
    const k = key(v);
    if (roots.has(k)) return roots.get(k)!;
    if (seen.has(k)) fail('PRECONDITION_FAILED', 'Linaje histórico circular');
    const l = lineage.get(k);
    if (!l) { roots.set(k, v); return v; }
    if (l.sourceTableName !== v.table) fail('PRECONDITION_FAILED', 'Linaje histórico cambia de tipo');
    const sourceKey = key({ workspaceId: Number(l.sourceWorkspaceId), table: l.sourceTableName, id: Number(l.sourceEntityId) });
    // Base-year close snapshot has a self edge, not a second obligation.
    if (sourceKey === k) {
      if (Number(l.sourceYear) !== v.workspace.year || l.reason !== 'snapshot') fail('PRECONDITION_FAILED', 'Autorreferencia histórica inválida');
      roots.set(k, v); return v;
    }
    const source = versions.get(sourceKey);
    if (!source || source.workspace.companyId !== target.companyId || source.workspace.year >= v.workspace.year || Number(l.sourceYear) !== source.workspace.year || source.kind !== v.kind || source.processId !== v.processId) fail('PRECONDITION_FAILED', 'No se puede demostrar la identidad y empresa del linaje histórico');
    const origin = root(source, new Set(seen).add(k));
    roots.set(k, origin); return origin;
  }
  const groups = new Map<string, { origin: Version; versions: Version[] }>();
  const linkedSources = new Set<string>();
  const completedBacking = new Set<string>();
  for (const v of Array.from(versions.values())) {
    const origin = root(v);
    if (v.table !== 'linkedCommitments' && v.row.completed) completedBacking.add(key(origin));
    if (v.backing) {
      const originalBacking = root(v.backing);
      if (!origin.backing || key(root(origin.backing)) !== key(originalBacking)) fail('PRECONDITION_FAILED', 'Linaje de compromiso cambia la fuente real');
      linkedSources.add(key(originalBacking));
    }
    const group = groups.get(key(origin)) ?? { origin, versions: [] };
    group.versions.push(v); groups.set(key(origin), group);
  }
  const events = await annualRows(c, `SELECT h.* FROM annualHistoricalResolutions h JOIN annualWorkspaces tw ON tw.id=h.targetWorkspaceId AND tw.companyId=h.companyId AND tw.year=h.recordedYear JOIN annualWorkspaces sw ON sw.id=h.sourceWorkspaceId AND sw.companyId=h.companyId AND sw.year<h.recordedYear WHERE h.companyId=? AND h.recordedYear<=? AND tw.status<>'preparing' ORDER BY h.recordedYear,h.id`, [target.companyId, target.year]);
  const latest = new Map<string, Row>();
  for (const event of events) {
    if (!HISTORICAL_SOURCE_TABLES.includes(event.sourceTable)) fail('PRECONDITION_FAILED', 'Evento histórico con tabla inválida');
    const v = versions.get(key({ workspaceId: Number(event.sourceWorkspaceId), table: event.sourceTable, id: Number(event.sourceId) }));
    if (!v) fail('PRECONDITION_FAILED', 'Evento histórico sin fuente verificable');
    latest.set(key(root(v)), event);
  }
  const sourceCompleted = new Set<string>();
  const items: HistoricalItem[] = [];
  for (const [groupKey, group] of Array.from(groups)) {
    const { origin } = group;
    if (origin.workspace.year >= target.year) continue;
    // Approved new annual execution is already visible in the selected schedule.
    // Do not fabricate a second historical pending or mark the source completed.
    if (group.versions.some(v => v.workspaceId === target.id && v.table === 'linkedCommitments' && v.row.sourceWorkspaceId != null && lineage.get(key(v))?.reason === 'approved-process')) continue;
    if (origin.table !== 'linkedCommitments' && linkedSources.has(groupKey)) continue;
    if (origin.processId === null ? !access.raw || processId !== undefined : !canAccessProcess(access.policy, origin.processId, 'read', target.companyId) || (processId !== undefined && processId !== origin.processId)) continue;
    // Completion in any proven version wins over a stale pending copy. The
    // linked obligation is independent of other processes, never aggregated.
    const completed = group.versions.some(v => v.table === 'linkedCommitments' ? v.row.status === 'completed' || Boolean(v.backing && completedBacking.has(key(root(v.backing)))) : Boolean(v.row.completed));
    const event = latest.get(groupKey);
    const hadPending = group.versions.some(v => v.table === 'linkedCommitments' ? v.row.status === 'pending' : !v.row.completed);
    if (!hadPending && !event) continue;
    const id = historicalObligationId(target.companyId, origin);
    if (completed) sourceCompleted.add(id);
    items.push({ id, sourceYear: origin.workspace.year, sourceWorkspaceId: origin.workspaceId, kind: origin.kind, sourceTable: origin.table, sourceId: origin.id, processId: origin.processId,
      title: String(origin.table === 'linkedCommitments' ? origin.row.title : origin.table === 'programActions' ? origin.row.action : origin.row.closureTask || origin.row.finding),
      dueDate: dateValue(origin.table === 'linkedCommitments' ? origin.row.dueDate : origin.table === 'programActions' ? origin.row.implementationDate : origin.row.targetDate),
      status: completed ? 'completed' : event?.status ?? 'pending', notes: event ? String(event.notes) : String(origin.row.notes ?? '').slice(0, 2000),
      resolvedYear: event?.status === 'completed' ? Number(event.recordedYear) : null });
  }
  items.sort((a, b) => a.sourceYear - b.sourceYear || a.sourceWorkspaceId - b.sourceWorkspaceId || a.sourceTable.localeCompare(b.sourceTable) || a.sourceId - b.sourceId);
  return { items, sourceCompleted };
}

export async function listAnnualHistory(input: { companyId: number; year: number; processId?: number }, ctx: TrpcContext): Promise<{ items: HistoricalItem[]; year: number }> {
  validateInput(input.companyId, input.year, input.processId);
  return withAnnualBaseConnection(async c => {
    const access = await accessOnConnection(c, input.companyId, ctx);
    // Reading 2026 may register metadata only; future years never auto-create.
    if (input.year === BASE_YEAR) await getWorkspaceForScope(input.companyId, input.year);
    await c.beginTransaction();
    try {
      const target = await workspaceOnConnection(c, input.companyId, input.year);
      const { items } = await itemsOnConnection(c, target, access, input.processId);
      await c.commit(); return { items, year: input.year };
    } catch (error) { await c.rollback(); throw error; }
  });
}
export async function resolveAnnualHistory(input: { companyId: number; year: number; id: string; status: 'pending' | 'completed'; notes: string }, ctx: TrpcContext): Promise<{ success: true }> {
  validateInput(input.companyId, input.year);
  if (typeof input.id !== 'string' || !HISTORICAL_ID_PATTERN.test(input.id)) fail('BAD_REQUEST', 'Identificador histórico inválido');
  if (!['pending', 'completed'].includes(input.status)) fail('BAD_REQUEST', 'Estado histórico inválido');
  if (typeof input.notes !== 'string' || input.notes.length > 2000) fail('BAD_REQUEST', 'Notas históricas: máximo 2000 caracteres');
  return withAnnualBaseConnection(async c => {
    await c.beginTransaction();
    try {
      // Same canonical row lock used by close: no close/resolve race, and no
      // reliance on the year currently selected in requestScope.
      const target = await workspaceOnConnection(c, input.companyId, input.year, true);
      if (target.status !== 'open') fail('FORBIDDEN', 'El año cerrado es de solo lectura');
      const access = await accessOnConnection(c, input.companyId, ctx);
      const { items, sourceCompleted } = await itemsOnConnection(c, target, access);
      const item = items.find(i => i.id === input.id);
      if (!item) fail('FORBIDDEN', 'Obligación inexistente o no autorizada en este año y empresa');
      if (item.processId === null ? !access.policy.fullAccess && access.policy.moduleAccess.management_systems !== 'write' : !canAccessProcess(access.policy, item.processId, 'write', input.companyId)) fail('FORBIDDEN', 'No tiene permiso de edición para esta obligación');
      if (item.sourceYear >= target.year || !HISTORICAL_SOURCE_TABLES.includes(item.sourceTable as HistoricalSourceTable)) fail('BAD_REQUEST', 'La fuente debe ser de un año anterior y tipo permitido');
      if (input.status === 'pending' && sourceCompleted.has(item.id)) fail('PRECONDITION_FAILED', 'La fuente ya está completada; una copia pendiente no puede reabrirla');
      await c.query('INSERT INTO annualHistoricalResolutions(companyId,targetWorkspaceId,recordedYear,sourceWorkspaceId,sourceTable,sourceId,status,notes,actor) VALUES(?,?,?,?,?,?,?,?,?)', [input.companyId, target.id, target.year, item.sourceWorkspaceId, item.sourceTable, item.sourceId, input.status, input.notes, JSON.stringify(access.actor)]);
      await c.commit(); return { success: true };
    } catch (error) { await c.rollback(); throw error; }
  });
}
