import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { createHash } from 'node:crypto';
import { getDatabasePool } from '../db';
import { annualHistoricalResolutions, annualWorkspaces, annualEntityLineage } from '../../drizzle/schema';
import { historicalObligationId, listAnnualHistory, resolveAnnualHistory } from './history';
import { annualHistoryRouter } from '../routers/annualHistory';
import { namespaceTable, quoteIdentifier } from './manifest';
import { PRESERVE_STRATEGY } from './store';
import { router } from '../_core/trpc';
import { assertAnnualIntegrationDatabase } from '../__tests__/helpers/annualTestSafety';

// Fail BEFORE any connection: cannot silently skip or run against review/prod.
assertAnnualIntegrationDatabase();
// Exclusive history block, distinct from core (998710xxx), lease and normal
// AUTO_INCREMENT fixtures. Neither a numeric interval nor a name proves ownership.
const C = 998720001, OTHER = 998720002, P = 998720011, P2 = 998720012, OP = 998720013;
const ADMIN = 998720021, MANAGER = 998720022, LEADER = 998720023, COORD = 998720024;
const ADMIN_ROLE = 998720031, MANAGER_ROLE = 998720032, LEADER_ROLE = 998720033, COORD_ROLE = 998720034, ACCESS = 998720041;
let W26 = 0, W27 = 0, W28 = 0, OW26 = 0, OW27 = 0;
const PROGRAM = 998720201, INSPECTION = 998720202, A1 = 998720211, A2 = 998720212, A3 = 998720213, F1 = 998720221, F2 = 998720222, AUDIT = 998720223;
const L1 = 998720231, L2 = 998720232, LF1 = 998720233, LF2 = 998720234;
const pool = getDatabasePool();
const q = async (sql: string, args: any[] = []) => { const [rows] = await pool.query(sql, args); return rows as any; };
const sourceTables = ['processes', 'managementPrograms', 'programActions', 'inspections', 'operationalFindings', 'linkedCommitments'];
const fixtureIds: Record<string, number[]> = { processes: [P,P2,OP], managementPrograms: [PROGRAM], programActions: [A1,A2,A3], inspections: [INSPECTION], operationalFindings: [F1,F2,AUDIT], linkedCommitments: [L1,L2,LF1,LF2], companyManagementAccess: [ACCESS], account_roles: [ADMIN_ROLE,MANAGER_ROLE,LEADER_ROLE,COORD_ROLE], accounts: [ADMIN,MANAGER,LEADER,COORD], companies: [C,OTHER] };
const createdRows = new Map<string, number[]>();
const createdWorkspaceIds: number[] = [];
const createdNamespaces: Array<{ name: string; table: string }> = [];
async function seed(table: string, sql: string, args: any[], ids = fixtureIds[table]) {
  const result = await q(sql,args);
  createdRows.set(table,[...(createdRows.get(table) ?? []),...ids]);
  return result;
}
const ctx = (extra: any) => ({ req: { headers: {} }, res: {}, user: null, manager: null, processLeader: null, ...extra }) as any;
const admin = ctx({ user: { id: ADMIN, role: 'admin', name: 'Fixture admin' } });
const manager = ctx({ manager: { companyId: C, managerEmail: 'annual-history-manager@example.invalid' } });
const leader = ctx({ processLeader: { companyId: C, processId: P, processLeaderId: LEADER } });
const coordinator = ctx({ processLeader: { companyId: C, processId: P, processLeaderId: COORD } });
const input = { companyId: C, year: 2027 };
const id = (table: 'programActions' | 'operationalFindings' | 'linkedCommitments', rowId: number, workspaceId = W26) => historicalObligationId(C, { workspaceId, table, id: rowId });
let beforeDigest = '';
async function digestSource() {
  const snapshot = [];
  for (const [table,ids] of Object.entries(fixtureIds)) snapshot.push([table, await q(`SELECT * FROM ${quoteIdentifier(table)} WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids)]);
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}
async function createMetadata() {
  for (const t of [annualWorkspaces, annualEntityLineage, annualHistoricalResolutions]) {
    const cfg = getTableConfig(t);
    const columns = cfg.columns.map(c => {
      let sql = `${quoteIdentifier(c.name)} ${c.getSQLType()}`;
      if (c.notNull) sql += ' NOT NULL';
      if (c.primary) sql += ' PRIMARY KEY';
      if ('autoIncrement' in c && c.autoIncrement) sql += ' AUTO_INCREMENT';
      if (c.hasDefault) {
        if (c.name === 'createdAt' || c.name === 'updatedAt') sql += ' DEFAULT CURRENT_TIMESTAMP';
        else if (typeof c.default === 'number') sql += ` DEFAULT ${c.default}`;
        else if (typeof c.default === 'string') sql += ` DEFAULT '${c.default}'`;
      }
      return sql;
    });
    for (const u of cfg.uniqueConstraints) columns.push(`CONSTRAINT ${quoteIdentifier(u.name!)} UNIQUE (${u.columns.map(c => quoteIdentifier(c.name)).join(',')})`);
    for (const i of cfg.indexes) columns.push(`INDEX ${quoteIdentifier(i.config.name)} (${i.config.columns.map(c => quoteIdentifier(c.name!)).join(',')})`);
    await q(`CREATE TABLE IF NOT EXISTS ${quoteIdentifier(cfg.name)} (${columns.join(',')}) ENGINE=InnoDB`);
  }
}
async function workspace(workspaceId: number, companyId: number, year: number, storage: 'base' | 'namespace') {
  await q("INSERT INTO annualWorkspaces(id,companyId,year,sourceYear,status,storage,strategyJson) VALUES(?,?,?,?, 'open',?,?)", [workspaceId, companyId, year, year === 2026 ? null : year - 1, storage, JSON.stringify(PRESERVE_STRATEGY)]);
  createdWorkspaceIds.push(workspaceId);
  if (storage === 'namespace') {
    for (const t of sourceTables) {
      const name = namespaceTable(workspaceId, t);
      const occupied = await q('SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [name]);
      if (occupied.length) throw new Error('Reserved history namespace already exists; do not overwrite');
      await q(`CREATE TABLE ${quoteIdentifier(name)} LIKE ${quoteIdentifier(t)}`); createdNamespaces.push({ name, table: t });
    }
    await q(`INSERT INTO ${quoteIdentifier(namespaceTable(workspaceId, 'processes'))} SELECT * FROM processes WHERE companyId=?`, [companyId]);
    await q(`INSERT INTO ${quoteIdentifier(namespaceTable(workspaceId, 'managementPrograms'))} SELECT * FROM managementPrograms WHERE companyId=?`, [companyId]);
  }
}
async function copiedVersion(table: string, rowId: number, fromWorkspace: number, toWorkspace: number, sourceYear: number) {
  const source = fromWorkspace === W26 ? quoteIdentifier(table) : quoteIdentifier(namespaceTable(fromWorkspace, table));
  await q(`INSERT INTO ${quoteIdentifier(namespaceTable(toWorkspace, table))} SELECT * FROM ${source} WHERE id=?`, [rowId]);
  await q('INSERT INTO annualEntityLineage(workspaceId,tableName,entityId,sourceWorkspaceId,sourceYear,sourceTableName,sourceEntityId,sourceHash,destinationHash,reason) VALUES(?,?,?,?,?,?,?,?,?,?)', [toWorkspace, table, rowId, fromWorkspace, sourceYear, table, rowId, 'a'.repeat(64), 'a'.repeat(64), 'snapshot']);
}
describe('annualHistory strict local MySQL integration (exclusive 998720xxx fixtures)', () => {
  beforeAll(async () => {
    await createMetadata();
    for (const [table,ids] of Object.entries(fixtureIds)) {
      const existing = await q(`SELECT id FROM ${quoteIdentifier(table)} WHERE id IN (${ids.map(() => '?').join(',')}) LIMIT 1`,ids);
      if (existing.length) throw new Error(`History fixtures already exist in ${table}; refusing overwrite`);
    }
    const occupied = await q('SELECT id FROM annualWorkspaces WHERE companyId IN (?,?)', [C, OTHER]);
    if (occupied.length) throw new Error('History company workspaces already exist; refusing overwrite');
    // New deterministic five-ID block after BOTH metadata and retained DDL.
    // Even base workspace IDs are never reused, so a later close stays additive.
    const metadata = await q('SELECT id FROM annualWorkspaces WHERE id BETWEEN ? AND ?', [998721001,998729999]);
    const namespaces = await q("SELECT TABLE_NAME name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'aw_99872%'");
    const namespaceIds = namespaces.map((r: any) => Number(/^aw_(\d+)_/.exec(r.name)?.[1] ?? 0)).filter((id: number) => id >= 998721001 && id <= 998729999);
    const highest = Math.max(998721000,...metadata.map((r: any) => Number(r.id)),...namespaceIds);
    const first = 998721001 + Math.ceil((highest - 998721000) / 5) * 5;
    if (first + 4 > 998729999) throw new Error('Exclusive history namespace range exhausted; do not reuse');
    [W26, W27, W28, OW26, OW27] = [first, first + 1, first + 2, first + 3, first + 4];
    for (const [accountId, email] of [[ADMIN, 'annual-history-admin@example.invalid'], [MANAGER, 'annual-history-manager@example.invalid'], [LEADER, 'annual-history-leader@example.invalid'], [COORD, 'annual-history-coord@example.invalid']] as const) await seed('accounts',"INSERT INTO accounts(id,openId,email,name,status) VALUES(?,?,?,'History fixture','active')", [accountId, `history-fixture-${accountId}`, email], [accountId]);
    await seed('companies',"INSERT INTO companies(id,name,ownerAccountId,status) VALUES(?,?,?,'Activa'),(?,?,?,'Activa')", [C, 'History fixture', ADMIN, OTHER, 'Other history fixture', ADMIN]);
    await seed('processes',"INSERT INTO processes(id,companyId,name,processType) VALUES(?,?,?,'soporte'),(?,?,?,'soporte'),(?,?,?,'soporte')", [P, C, 'History process 1', P2, C, 'History process 2', OP, OTHER, 'Other process']);
    const roles = await q("SELECT id,slug FROM roles WHERE slug IN ('platform_admin','company_manager','process_leader')");
    const role = (slug: string) => { const r = roles.find((r: any) => r.slug === slug); if (!r) throw new Error('Canonical roles must be seeded'); return r.id; };
    await seed('account_roles','INSERT INTO account_roles(id,accountId,roleId,companyId,processId,status) VALUES(?,?,?,?,?,\'active\'),(?,?,?,?,?,\'active\'),(?,?,?,?,?,\'active\'),(?,?,?,?,?,\'active\')', [ADMIN_ROLE, ADMIN, role('platform_admin'), 0, 0, MANAGER_ROLE, MANAGER, role('company_manager'), C, 0, LEADER_ROLE, LEADER, role('process_leader'), C, P, COORD_ROLE, COORD, role('process_leader'), C, P]);
    await seed('companyManagementAccess',"INSERT INTO companyManagementAccess(id,companyId,accountId,accessLevel) VALUES(?,?,?,'coordinator')", [ACCESS, C, COORD]);
    await seed('managementPrograms','INSERT INTO managementPrograms(id,companyId,programName,managementSystem,plannedActions,completedActions) VALUES(?,?,?, ?,3,1)', [PROGRAM, C, 'Historical program', 'Fixture']);
    // Historical timestamps make restore assertions independent of second-level
    // clock timing. Tampering companyId triggers ON UPDATE CURRENT_TIMESTAMP.
    await seed('programActions',"INSERT INTO programActions(id,programId,companyId,action,completed,implementationDate,updatedAt) VALUES(?,?,?,?,0,'2026-12-01','2026-11-01 00:00:00'),(?,?,?,?,0,NULL,'2026-11-01 00:00:00'),(?,?,?,?,1,NULL,'2026-11-01 00:00:00')", [A1, PROGRAM, C, 'Shared linked program', A2, PROGRAM, C, 'Raw historical program', A3, PROGRAM, C, 'Already completed program']);
    await seed('inspections','INSERT INTO inspections(id,companyId,managementSystem) VALUES(?,?,?)', [INSPECTION, C, 'History inspection']);
    await seed('operationalFindings',"INSERT INTO operationalFindings(id,companyId,sourceType,sourceId,classification,finding,closureTask,completed,updatedAt) VALUES(?,?,'inspection',?,'minor_nc','Shared finding','Linked inspection closure',0,'2026-11-01 00:00:00'),(?,?,'inspection',?,'observation','Raw finding','Raw inspection closure',0,'2026-11-01 00:00:00'),(?,?,'audit',?,'observation','Audit excluded','Not historical pending here',0,'2026-11-01 00:00:00')", [F1, C, INSPECTION, F2, C, INSPECTION, AUDIT, C, INSPECTION]);
    for (const [rowId, process, kind, source, sub] of [[L1, P, 'program_action', A1, PROGRAM], [L2, P2, 'program_action', A1, PROGRAM], [LF1, P, 'inspection_finding', F1, F1], [LF2, P2, 'inspection_finding', F1, F1]]) await seed('linkedCommitments',"INSERT INTO linkedCommitments(id,companyId,processId,sourceType,sourceId,sourceSubId,kind,title,status) VALUES(?,?,?,?,?,?,'action',?,'pending')", [rowId, C, process, kind, source, sub, `History commitment ${rowId}`], [rowId]);
    await workspace(W26, C, 2026, 'base'); await workspace(W27, C, 2027, 'namespace');
    await workspace(OW26, OTHER, 2026, 'base'); await workspace(OW27, OTHER, 2027, 'namespace');
    beforeDigest = await digestSource();
  }, 60000);
  afterAll(async () => {
    // A refused ownership claim leaves existing data alone. Record only
    // successful inserts so partial setup never authorizes interval deletion.
    if (!createdRows.size && !createdWorkspaceIds.length) return;
    for (const {name,table} of createdNamespaces) {
      const ids=fixtureIds[table];
      await q(`DELETE FROM ${quoteIdentifier(name)} WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    }
    if (createdWorkspaceIds.length) {
      const placeholders=createdWorkspaceIds.map(() => '?').join(',');
      await q(`DELETE FROM annualHistoricalResolutions WHERE targetWorkspaceId IN (${placeholders}) AND companyId IN (?,?)`,[...createdWorkspaceIds,C,OTHER]);
      await q(`DELETE FROM annualEntityLineage WHERE workspaceId IN (${placeholders})`,createdWorkspaceIds);
      await q(`DELETE FROM annualWorkspaces WHERE id IN (${placeholders}) AND companyId IN (?,?)`,[...createdWorkspaceIds,C,OTHER]);
    }
    for (const table of ['linkedCommitments','operationalFindings','inspections','programActions','managementPrograms','companyManagementAccess','account_roles','processes','companies','accounts']) {
      const ids=createdRows.get(table);
      if (ids?.length) await q(`DELETE FROM ${quoteIdentifier(table)} WHERE id IN (${ids.map(() => '?').join(',')})`,ids);
    }
    // Keep namespace definitions as additive evidence; no DROP/reuse.
    // Do not close the shared canonical pool owned by other tests.
  }, 60000);
  it('lists all 2026 obligations although 2027 actions/inspections are empty; no duplicate raw sources', async () => {
    const result = await listAnnualHistory(input, manager);
    expect(result.year).toBe(2027); expect(result.items).toHaveLength(6);
    expect(result.items.map(i => i.id)).toEqual(expect.arrayContaining([id('linkedCommitments', L1), id('linkedCommitments', L2), id('linkedCommitments', LF1), id('linkedCommitments', LF2), id('programActions', A2), id('operationalFindings', F2)]));
    expect(result.items.every(i => i.sourceYear === 2026 && i.sourceWorkspaceId === W26 && i.status === 'pending')).toBe(true);
    expect(result.items.find(i => i.sourceId === L1)?.dueDate).toBe(null);
    for (const t of ['programActions', 'inspections', 'operationalFindings', 'linkedCommitments']) expect((await q(`SELECT COUNT(*) n FROM ${quoteIdentifier(namespaceTable(W27, t))}`))[0].n).toBe(0);
    expect(await digestSource()).toBe(beforeDigest);
  });
  it('standard jefe sees and resolves only own commitments; coordination only adds raw access', async () => {
    const own = await listAnnualHistory(input, leader); expect(own.items).toHaveLength(2); expect(own.items.every(i => i.processId === P)).toBe(true);
    const coord = await listAnnualHistory(input, coordinator); expect(coord.items).toHaveLength(4); expect(coord.items.every(i => i.processId === null || i.processId === P)).toBe(true);
    await expect(listAnnualHistory({ ...input, processId: P2 }, leader)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(listAnnualHistory({ ...input, processId: OP }, manager)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(resolveAnnualHistory({ ...input, id: id('linkedCommitments', L2), status: 'completed', notes: '' }, leader)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(resolveAnnualHistory({ ...input, id: id('programActions', A2), status: 'completed', notes: '' }, leader)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(resolveAnnualHistory({ ...input, id: id('linkedCommitments', L2), status: 'completed', notes: '' }, coordinator)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await resolveAnnualHistory({ ...input, id: id('linkedCommitments', L1), status: 'completed', notes: 'Closed own historical commitment' }, leader)).toEqual({ success: true });
    const result = await listAnnualHistory(input, manager);
    expect(result.items.find(i => i.id === id('linkedCommitments', L1))).toMatchObject({ status: 'completed', resolvedYear: 2027, notes: 'Closed own historical commitment' });
    expect(result.items.find(i => i.id === id('linkedCommitments', L2))?.status).toBe('pending');
    expect((await q('SELECT completed FROM programActions WHERE id=?', [A1]))[0].completed).toBe(0);
    expect(await digestSource()).toBe(beforeDigest);
    const [event] = await q('SELECT * FROM annualHistoricalResolutions WHERE companyId=? ORDER BY id', [C]);
    expect(JSON.parse(event.actor)).toMatchObject({ accountId: LEADER, role: 'process_leader', companyId: C, processId: P });
  });
  it('rejects spoofed actors, inactive real roles, foreign companies and source-less ids', async () => {
    await expect(listAnnualHistory({ companyId: OTHER, year: 2027 }, manager)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(resolveAnnualHistory({ companyId: OTHER, year: 2027, id: id('linkedCommitments', L1), status: 'completed', notes: '' }, admin)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(listAnnualHistory(input, ctx({ user: { id: LEADER, role: 'admin' } }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(listAnnualHistory(input, ctx({ processLeader: { companyId: C, processId: P2, processLeaderId: LEADER } }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const [roleBefore] = await q('SELECT * FROM account_roles WHERE id=?', [LEADER_ROLE]);
    await q("UPDATE account_roles SET status='suspended' WHERE id=?", [LEADER_ROLE]);
    try { await expect(listAnnualHistory(input, leader)).rejects.toMatchObject({ code: 'FORBIDDEN' }); }
    finally { await q('UPDATE account_roles SET status=? WHERE id=?', [roleBefore.status,LEADER_ROLE]); }
    expect((await q('SELECT * FROM account_roles WHERE id=?', [LEADER_ROLE]))[0]).toEqual(roleBefore);
    await expect(resolveAnnualHistory({ ...input, id: 'ah1_' + '0'.repeat(64), status: 'completed', notes: '' }, admin)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(resolveAnnualHistory({ ...input, id: id('linkedCommitments', L1), status: 'completed', notes: 'x'.repeat(2001) }, manager)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(listAnnualHistory({ companyId: C, year: 2029 }, manager)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // Tamper only this isolated fixture, then restore it. A link's companyId
    // cannot legitimize a backing source belonging to a different company.
    const [actionBefore] = await q('SELECT * FROM programActions WHERE id=?', [A1]);
    await q('UPDATE programActions SET companyId=? WHERE id=?', [OTHER, A1]);
    try { await expect(listAnnualHistory(input, manager)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); }
    finally { await q('UPDATE programActions SET companyId=?,updatedAt=? WHERE id=?', [actionBefore.companyId,actionBefore.updatedAt,A1]); }
    expect((await q('SELECT * FROM programActions WHERE id=?', [A1]))[0]).toEqual(actionBefore);
    const [findingBefore] = await q('SELECT * FROM operationalFindings WHERE id=?', [F1]);
    await q('UPDATE operationalFindings SET companyId=? WHERE id=?', [OTHER, F1]);
    try { await expect(listAnnualHistory(input, manager)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); }
    finally { await q('UPDATE operationalFindings SET companyId=?,updatedAt=? WHERE id=?', [findingBefore.companyId,findingBefore.updatedAt,F1]); }
    expect((await q('SELECT * FROM operationalFindings WHERE id=?', [F1]))[0]).toEqual(findingBefore);
    expect(await digestSource()).toBe(beforeDigest);
  });
  it('creating 2028 retains 2026; recordedYear<=2027 never rewrites 2027 from 2028', async () => {
    await workspace(W28, C, 2028, 'namespace');
    const before = await listAnnualHistory(input, manager);
    expect((await listAnnualHistory({ ...input, year: 2028 }, manager)).items).toHaveLength(6);
    await resolveAnnualHistory({ ...input, year: 2028, id: id('linkedCommitments', L1), status: 'pending', notes: 'Reopened in 2028 only' }, manager);
    await resolveAnnualHistory({ ...input, year: 2028, id: id('linkedCommitments', L2), status: 'completed', notes: 'Resolved in 2028 only' }, manager);
    expect(await listAnnualHistory(input, manager)).toEqual(before);
    expect((await listAnnualHistory({ ...input, year: 2028 }, manager)).items.find(i => i.id === id('linkedCommitments', L1))).toMatchObject({ status: 'pending', resolvedYear: null, notes: 'Reopened in 2028 only' });
    expect((await listAnnualHistory({ ...input, year: 2028 }, manager)).items.find(i => i.id === id('linkedCommitments', L2))).toMatchObject({ status: 'completed', resolvedYear: 2028 });
    expect(await digestSource()).toBe(beforeDigest);
    expect((await q('SELECT COUNT(*) n FROM annualHistoricalResolutions WHERE companyId=?', [C]))[0].n).toBe(3);
    const [event] = await q('SELECT actor FROM annualHistoricalResolutions WHERE companyId=? ORDER BY id DESC LIMIT 1', [C]);
    expect(JSON.parse(event.actor)).toMatchObject({ accountId: MANAGER, role: 'manager', companyId: C, processId: null });
  });
  it('deduplicates true copied lineage, not unrelated identical numeric IDs; completed origin wins stale copy', async () => {
    await copiedVersion('programActions', A2, W26, W27, 2026);
    await copiedVersion('programActions', A3, W26, W27, 2026);
    await q(`UPDATE ${quoteIdentifier(namespaceTable(W27, 'programActions'))} SET completed=0 WHERE id=?`, [A3]);
    await q(`INSERT INTO ${quoteIdentifier(namespaceTable(W27, 'programActions'))}(id,companyId,programId,action,completed) VALUES(?,?,?,?,0)`, [A1, C, PROGRAM, 'Different 2027 obligation with same local ID']);
    const result = await listAnnualHistory({ ...input, year: 2028 }, manager);
    expect(result.items.filter(i => i.id === id('programActions', A2))).toHaveLength(1);
    expect(result.items.find(i => i.id === id('programActions', A1, W27))).toMatchObject({ sourceYear: 2027, title: 'Different 2027 obligation with same local ID', status: 'pending' });
    expect(result.items.find(i => i.id === id('programActions', A3))).toMatchObject({ sourceYear: 2026, status: 'completed' });
    await expect(resolveAnnualHistory({ ...input, year: 2028, id: id('programActions', A3), status: 'pending', notes: 'Must not reopen' }, manager)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(await digestSource()).toBe(beforeDigest);
  });
  it('deduplicates per-commitment versions and retains independent other-process obligation', async () => {
    await copiedVersion('programActions', A1, W26, W28, 2026);
    await copiedVersion('linkedCommitments', L1, W26, W28, 2026);
    await copiedVersion('linkedCommitments', L2, W26, W28, 2026);
    const result = await listAnnualHistory({ ...input, year: 2028 }, manager);
    expect(result.items.filter(i => i.id === id('linkedCommitments', L1))).toHaveLength(1);
    expect(result.items.filter(i => i.id === id('linkedCommitments', L2))).toHaveLength(1);
    expect(result.items.find(i => i.id === id('programActions', A1))).toBeUndefined();
    const before = await digestSource();
    await resolveAnnualHistory({ ...input, year: 2028, id: id('linkedCommitments', LF1), status: 'completed', notes: 'Only inspection process 1' }, leader);
    expect((await listAnnualHistory({ ...input, year: 2028 }, manager)).items.find(i => i.id === id('linkedCommitments', LF2))?.status).toBe('pending');
    expect((await q('SELECT completed FROM operationalFindings WHERE id=?', [F1]))[0].completed).toBe(0);
    expect(await digestSource()).toBe(before);
  });
  it('target row FOR UPDATE serializes close/resolve; closed list remains allowed and failed resolve adds nothing', async () => {
    const count = (await q('SELECT COUNT(*) n FROM annualHistoricalResolutions WHERE companyId=?', [C]))[0].n;
    const c = await pool.getConnection();
    await c.beginTransaction();
    await c.query('SELECT id FROM annualWorkspaces WHERE id=? FOR UPDATE', [W28]);
    let settled = false;
    const resolution = resolveAnnualHistory({ ...input, year: 2028, id: id('programActions', A2), status: 'completed', notes: 'Race with close' }, manager).then(() => { settled = true; return null; }, e => { settled = true; return e; });
    try {
      await new Promise(r => setTimeout(r, 150)); expect(settled).toBe(false);
      await c.query("UPDATE annualWorkspaces SET status='closed' WHERE id=?", [W28]); await c.commit();
    } finally { await c.rollback(); c.release(); }
    expect(await resolution).toMatchObject({ code: 'FORBIDDEN' });
    expect((await listAnnualHistory({ ...input, year: 2028 }, manager)).items.length).toBeGreaterThan(0);
    expect((await q('SELECT COUNT(*) n FROM annualHistoricalResolutions WHERE companyId=?', [C]))[0].n).toBe(count);
    await expect(resolveAnnualHistory({ ...input, year: 2028, id: id('programActions', A2), status: 'completed', notes: '' }, manager)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('source can close without losing obligations, and actual router runs exempt control despite closed selected year', async () => {
    for (const t of sourceTables) {
      const name = namespaceTable(W26, t);
      await q(`CREATE TABLE ${quoteIdentifier(name)} LIKE ${quoteIdentifier(t)}`); createdNamespaces.push({ name, table: t });
      await q(`INSERT INTO ${quoteIdentifier(name)} SELECT * FROM ${quoteIdentifier(t)} WHERE companyId=?`, [C]);
    }
    for (const t of ['linkedCommitments', 'programActions', 'operationalFindings']) {
      const rows = await q(`SELECT id FROM ${quoteIdentifier(namespaceTable(W26, t))} WHERE companyId=?`, [C]);
      for (const row of rows) await q('INSERT INTO annualEntityLineage(workspaceId,tableName,entityId,sourceWorkspaceId,sourceYear,sourceTableName,sourceEntityId,sourceHash,destinationHash,reason) VALUES(?,?,?,?,?,?,?,?,?,?)', [W26, t, row.id, W26, 2026, t, row.id, 'a'.repeat(64), 'a'.repeat(64), 'snapshot']);
    }
    await q("UPDATE annualWorkspaces SET status='closed',storage='namespace' WHERE id=?", [W26]);
    const closedSelection = ctx({ ...manager, req: { headers: { 'x-isge-company-id': String(C), 'x-isge-year': '2026' } } });
    const caller = router({ annualHistory: annualHistoryRouter }).createCaller(closedSelection).annualHistory;
    expect((await caller.list(input)).items.some(i => i.sourceYear === 2026)).toBe(true);
    expect(await caller.resolve({ ...input, id: id('programActions', A2), status: 'completed', notes: 'Closed source is immutable' })).toEqual({ success: true });
    expect(await digestSource()).toBe(beforeDigest);
  });
});
