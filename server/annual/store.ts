import { createHash } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getDatabasePool } from '../db';
import { withoutAnnualScope } from './runtime';
import { namespaceTable, quoteIdentifier } from './manifest';
import { copyWorkspaceRows, prepareNamespace, incorporateProcessRows, readCompanyDataset, collectAnnualFileKeys } from './migration';
import { withAnnualCompanyLease } from './lease';

export const BASE_YEAR = 2026;
export interface AnnualStrategy {
  purpose: boolean; mission: boolean; vision: boolean; values: boolean;
  policy: boolean; strategicObjectives: boolean;
}
export interface AnnualWorkspaceRecord {
  id: number; companyId: number; year: number; sourceYear: number | null;
  status: 'open' | 'closed'; storage: 'base' | 'namespace'; strategy: AnnualStrategy;
}
export interface AnnualActor { accountId?: number | null; role?: string; companyId?: number; name?: string | null; user?: {id:number;role?:string;name?:string|null}|null; manager?:{companyId:number;managerEmail:string}|null }
export const PRESERVE_STRATEGY: AnnualStrategy = { purpose:true, mission:true, vision:true, values:true, policy:true, strategicObjectives:true };
export function validateStrategy(strategy: AnnualStrategy): void {
  if (!strategy || Object.keys(PRESERVE_STRATEGY).some(k => typeof strategy[k as keyof AnnualStrategy] !== 'boolean') || Object.keys(strategy).length !== 6) throw new TRPCError({code:'BAD_REQUEST',message:'Debe elegir explícitamente las seis opciones de estrategia'});
}
function validateIdentity(companyId:number, year:number) {
  if (!Number.isSafeInteger(companyId) || companyId <= 0 || !Number.isInteger(year) || year < BASE_YEAR || year > 2100) throw new TRPCError({code:'BAD_REQUEST',message:'Empresa o año anual inválido'});
}
export function normalizeAnnualActor(actor:AnnualActor):AnnualActor {
  if (actor.user?.role==='admin') return {role:'admin',accountId:actor.user.id,name:actor.user.name};
  if (actor.manager) return {role:'manager',companyId:actor.manager.companyId,name:actor.manager.managerEmail};
  return {role:actor.role,accountId:actor.accountId,companyId:actor.companyId,name:actor.name};
}
export function assertAnnualManager(actor: AnnualActor, companyId:number) {
  actor=normalizeAnnualActor(actor);
  if (actor?.role === 'admin' || (actor?.role === 'manager' && actor.companyId === companyId)) return;
  throw new TRPCError({code:'FORBIDDEN',message:'Solo Gerencia de la empresa o Administrador puede gestionar años'});
}
export async function annualRows<T = Record<string,any>>(connection: PoolConnection, query:string, values:unknown[] = []): Promise<T[]> {
  const [rows] = await connection.query<RowDataPacket[]>(query, values);
  return rows as T[];
}
function record(row:Record<string,any>): AnnualWorkspaceRecord {
  if (row.status === 'preparing') throw new TRPCError({code:'CONFLICT',message:'El espacio anual aún no está preparado'});
  return { id:Number(row.id), companyId:Number(row.companyId), year:Number(row.year), sourceYear:row.sourceYear === null ? null : Number(row.sourceYear), status:row.status, storage:row.storage, strategy:JSON.parse(row.strategyJson) };
}
/** Every migration/store operation executes on canonical base pool, never recursively scoped. */
export async function withAnnualBaseConnection<T>(operation:(connection:PoolConnection)=>Promise<T>):Promise<T> {
  return withoutAnnualScope(async () => {
    const connection = await getDatabasePool().getConnection();
    try { return await operation(connection); } finally { connection.release(); }
  });
}
export async function workspaceOnConnection(c:PoolConnection, companyId:number, year:number, lock=false):Promise<AnnualWorkspaceRecord> {
  const [row] = await annualRows(c, 'SELECT * FROM annualWorkspaces WHERE companyId=? AND year=?' + (lock?' FOR UPDATE':''), [companyId,year]);
  if (!row) throw new TRPCError({code:'NOT_FOUND',message:`El año ${year} no existe; Gerencia debe crearlo explícitamente`});
  return record(row);
}
export async function getWorkspaceForScope(companyId:number, year:number):Promise<AnnualWorkspaceRecord> {
  validateIdentity(companyId,year);
  return withAnnualBaseConnection(async c => {
    if (year === BASE_YEAR) {
      const [company] = await annualRows(c,'SELECT id FROM companies WHERE id=?',[companyId]);
      if (!company) throw new TRPCError({code:'NOT_FOUND',message:'Empresa no encontrada'});
      // Metadata-only registration. No business source INSERT/UPDATE/BACKFILL.
      await c.query(`INSERT INTO annualWorkspaces(companyId,year,sourceYear,status,storage,strategyJson) VALUES(?,?,NULL,'open','base',?) ON DUPLICATE KEY UPDATE id=id`,[companyId,BASE_YEAR,JSON.stringify(PRESERVE_STRATEGY)]);
    }
    return workspaceOnConnection(c,companyId,year);
  });
}
export async function listWorkspaces(companyId:number):Promise<AnnualWorkspaceRecord[]> {
  await getWorkspaceForScope(companyId,BASE_YEAR);
  return withAnnualBaseConnection(async c => (await annualRows(c,"SELECT * FROM annualWorkspaces WHERE companyId=? AND status<>'preparing' ORDER BY year",[companyId])).map(record));
}
export async function getProcessWorkspaceStatus(workspaceId:number, processId:number):Promise<'pending'|'incorporated'> {
  return withAnnualBaseConnection(async c => {
    const [w] = await annualRows(c,"SELECT * FROM annualWorkspaces WHERE id=? AND status<>'preparing'",[workspaceId]);
    if (!w) throw new TRPCError({code:'NOT_FOUND',message:'Espacio anual no disponible'});
    const table = w.storage === 'base' ? 'processes' : namespaceTable(workspaceId,'processes');
    const [process] = await annualRows(c,`SELECT id FROM ${quoteIdentifier(table)} WHERE id=? AND companyId=?`,[processId,w.companyId]);
    if (!process) throw new TRPCError({code:'NOT_FOUND',message:'El proceso no pertenece al espacio anual'});
    if (Number(w.year) === BASE_YEAR) return 'incorporated';
    const [state] = await annualRows(c,'SELECT status FROM annualProcessStates WHERE workspaceId=? AND processId=?',[workspaceId,processId]);
    return state?.status === 'incorporated' ? 'incorporated' : 'pending';
  });
}
/** Serialize preparation/incorporation/close for a company; DDL is outside the row transaction. */
async function withCompanyLock<T>(companyId:number, operation:(c:PoolConnection)=>Promise<T>):Promise<T> {
  // Same admission protocol as scoped writes. Queueing happens BEFORE a pool
  // connection is obtained; a close cannot snapshot around an authorized write.
  return withoutAnnualScope(() => withAnnualCompanyLease(companyId, operation));
}
export async function createAnnualWorkspace(input:{companyId:number;year:number;sourceYear:number;strategy:AnnualStrategy;actor:AnnualActor}):Promise<AnnualWorkspaceRecord> {
  validateIdentity(input.companyId,input.year); validateStrategy(input.strategy); assertAnnualManager(input.actor,input.companyId);
  if (input.year <= BASE_YEAR || input.sourceYear !== input.year-1) throw new TRPCError({code:'BAD_REQUEST',message:'El origen debe ser el año anterior existente'});
  await getWorkspaceForScope(input.companyId,input.sourceYear);
  return withCompanyLock(input.companyId, async c => {
    const [existing] = await annualRows(c,'SELECT * FROM annualWorkspaces WHERE companyId=? AND year=?',[input.companyId,input.year]);
    if (existing) {
      if (existing.status === 'preparing') throw new TRPCError({code:'CONFLICT',message:'Preparación anterior incompleta; requiere revisión explícita, no fallback'});
      const w = record(existing);
      if (w.sourceYear !== input.sourceYear || JSON.stringify(w.strategy) !== JSON.stringify(input.strategy)) {
        // Key order is not a business difference.
        if (w.sourceYear !== input.sourceYear || Object.keys(PRESERVE_STRATEGY).some(k=>w.strategy[k as keyof AnnualStrategy] !== input.strategy[k as keyof AnnualStrategy])) throw new TRPCError({code:'CONFLICT',message:'El año ya existe con opciones distintas'});
      }
      return w;
    }
    const source = await workspaceOnConnection(c,input.companyId,input.sourceYear);
    const [result] = await c.query<ResultSetHeader>("INSERT INTO annualWorkspaces(companyId,year,sourceYear,status,storage,strategyJson,createdByJson) VALUES(?,?,?,'preparing','namespace',?,?)",[input.companyId,input.year,input.sourceYear,JSON.stringify(input.strategy),JSON.stringify(normalizeAnnualActor(input.actor))]);
    const target:AnnualWorkspaceRecord = {id:result.insertId,companyId:input.companyId,year:input.year,sourceYear:input.sourceYear,status:'open',storage:'namespace',strategy:input.strategy};
    await prepareNamespace(c,source,target);
    await c.beginTransaction();
    try {
      await copyWorkspaceRows(c,source,target,'new-year');
      await c.query("INSERT INTO annualProcessStates(workspaceId,processId,status) SELECT ?,id,'pending' FROM " + quoteIdentifier(namespaceTable(target.id,'processes')),[target.id]);
      await c.query("UPDATE annualWorkspaces SET status='open' WHERE id=? AND status='preparing'",[target.id]);
      await c.commit();
      return target;
    } catch(error) { await c.rollback(); throw error; }
  });
}
export async function incorporateApprovedProcess(input:{companyId:number;year:number;processId:number;actor:AnnualActor}):Promise<{alreadyIncorporated:boolean}> {
  validateIdentity(input.companyId,input.year); assertAnnualManager(input.actor,input.companyId);
  return withCompanyLock(input.companyId,async c => {
    await c.beginTransaction();
    try {
      const target = await workspaceOnConnection(c,input.companyId,input.year,true);
      if (target.status !== 'open' || target.storage !== 'namespace' || target.sourceYear === null) throw new TRPCError({code:'FORBIDDEN',message:'El destino no permite incorporación'});
      const [state] = await annualRows(c,'SELECT * FROM annualProcessStates WHERE workspaceId=? AND processId=? FOR UPDATE',[target.id,input.processId]);
      if (!state) throw new TRPCError({code:'NOT_FOUND',message:'El proceso no pertenece al destino'});
      if (state.status === 'incorporated') { await c.commit(); return {alreadyIncorporated:true}; }
      const source = await workspaceOnConnection(c,input.companyId,target.sourceYear);
      const [cycle] = await annualRows(c,'SELECT * FROM planningCycles WHERE companyId=? AND processId=? AND cycleYear=? FOR UPDATE',[input.companyId,input.processId,input.year]);
      if (!cycle || cycle.status !== 'ready' || cycle.managerApprovalStatus !== 'approved' || !cycle.managerReviewedAt) throw new TRPCError({code:'PRECONDITION_FAILED',message:'Se requiere ciclo ready y aprobación real de Gerencia'});
      const decisions = await annualRows(c,'SELECT * FROM planningCycleDecisions WHERE targetCycleId=? ORDER BY id FOR UPDATE',[cycle.id]);
      if (decisions.some(d=>!['migrate','close','review'].includes(d.decision))) throw new TRPCError({code:'PRECONDITION_FAILED',message:'Todas las decisiones deben estar resueltas'});
      const snapshotHash = await incorporateProcessRows(c,source,target,input.processId,cycle,decisions);
      await c.query("UPDATE annualProcessStates SET status='incorporated',sourceCycleId=?,approvalSnapshotHash=?,incorporatedByJson=?,incorporatedAt=CURRENT_TIMESTAMP WHERE id=?",[cycle.id,snapshotHash,JSON.stringify(normalizeAnnualActor(input.actor)),state.id]);
      await c.commit(); return {alreadyIncorporated:false};
    } catch(error) { await c.rollback(); throw error; }
  });
}
export async function closeAnnualWorkspace(input:{companyId:number;year:number;actor:AnnualActor}):Promise<AnnualWorkspaceRecord> {
  validateIdentity(input.companyId,input.year); assertAnnualManager(input.actor,input.companyId);
  await getWorkspaceForScope(input.companyId,input.year);
  return withCompanyLock(input.companyId,async c => {
    const w = await workspaceOnConnection(c,input.companyId,input.year);
    if (w.status === 'closed') return w;
    if (w.storage === 'base') await prepareNamespace(c,w,{...w,storage:'namespace'});
    await c.beginTransaction();
    try {
      await workspaceOnConnection(c,input.companyId,input.year,true);
      if (w.storage === 'base') await copyWorkspaceRows(c,w,{...w,storage:'namespace'},'snapshot');
      else {
        const current=await readCompanyDataset(c,w);
        for (const [table,rows] of Array.from(current)) await collectAnnualFileKeys(c,rows,w.id,`closed-snapshot:${table}`);
      }
      await c.query("UPDATE annualWorkspaces SET status='closed',storage='namespace',closedAt=CURRENT_TIMESTAMP,closedByJson=? WHERE id=?",[JSON.stringify(normalizeAnnualActor(input.actor)),w.id]);
      await c.commit(); return {...w,status:'closed',storage:'namespace'};
    } catch(error) { await c.rollback(); throw error; }
  });
}
export function normalizeAnnualFileKey(key:string):string {
  const clean = key.replace(/^\/+/, '');
  return clean.startsWith('uploads/') ? clean : `uploads/${clean}`;
}
export async function retainFileOnConnection(c:PoolConnection,key:string,workspaceId:number,reason:string):Promise<void> {
  if (!key || !Number.isSafeInteger(workspaceId) || workspaceId <= 0) throw new Error('Retención de archivo inválida');
  const normalized = normalizeAnnualFileKey(key);
  if (normalized.length > 1024) throw new Error('Clave de archivo demasiado larga');
  const hash = createHash('sha256').update(normalized).digest('hex');
  await c.query('INSERT INTO annualFileRetentions(workspaceId,fileKey,keyHash,reason) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE id=id',[workspaceId,normalized,hash,reason.slice(0,255)]);
}
export async function retainFile(key:string,workspaceId:number,reason:string):Promise<void> {
  await withAnnualBaseConnection(async c=> {
    const [w] = await annualRows(c,'SELECT id FROM annualWorkspaces WHERE id=?',[workspaceId]);
    if (!w) throw new Error('Espacio anual inexistente para retención');
    await retainFileOnConnection(c,key,workspaceId,reason);
  });
}
export async function isFileRetained(key:string):Promise<boolean> {
  const normalized = normalizeAnnualFileKey(key);
  const hash = createHash('sha256').update(normalized).digest('hex');
  return withAnnualBaseConnection(async c=> (await annualRows(c,'SELECT id FROM annualFileRetentions WHERE keyHash=? AND fileKey=? LIMIT 1',[hash,normalized])).length > 0);
}
export async function listRetainedFiles(workspaceId:number):Promise<Array<{fileKey:string;reason:string}>> {
  return withAnnualBaseConnection(c=>annualRows(c,'SELECT fileKey,reason FROM annualFileRetentions WHERE workspaceId=? ORDER BY id',[workspaceId]));
}
export async function getAnnualOverview(companyId:number,year:number) {
  const workspace = await getWorkspaceForScope(companyId,year);
  return withAnnualBaseConnection(async c=> {
    const pTable = workspace.storage === 'base' ? 'processes' : namespaceTable(workspace.id,'processes');
    const processes = await annualRows(c,`SELECT p.id,p.name,s.status,c.status cycleStatus,c.managerApprovalStatus FROM ${quoteIdentifier(pTable)} p LEFT JOIN annualProcessStates s ON s.workspaceId=? AND s.processId=p.id LEFT JOIN planningCycles c ON c.companyId=p.companyId AND c.processId=p.id AND c.cycleYear=? WHERE p.companyId=? ORDER BY p.name`,[workspace.id,year,companyId]);
    const result = processes.map(p=>({id:Number(p.id),name:String(p.name),status:(year===BASE_YEAR || p.status==='incorporated'?'incorporated':'pending') as 'pending'|'incorporated',approved:p.cycleStatus==='ready' && p.managerApprovalStatus==='approved'}));
    const trainingTable = workspace.storage === 'base' ? 'companyTrainings' : namespaceTable(workspace.id,'companyTrainings');
    const origins = await annualRows(c,`SELECT t.id,l.sourceYear FROM ${quoteIdentifier(trainingTable)} t LEFT JOIN annualEntityLineage l ON l.workspaceId=? AND l.tableName='companyTrainings' AND l.entityId=t.id WHERE t.companyId=?`,[workspace.id,companyId]);
    const trainingOrigins:Record<number,number> = {};
    for (const row of origins) trainingOrigins[Number(row.id)] = row.sourceYear === null ? year : Number(row.sourceYear);
    return {workspace,processes:result,incorporatedCount:result.filter(p=>p.status==='incorporated').length,totalCount:result.length,trainingOrigins};
  });
}
/** Read-only historical panel; never copied into the destination indicators. */
export async function listHistoricalPendings(companyId:number,year:number) {
  const destination = await getWorkspaceForScope(companyId,year);
  if (destination.sourceYear === null) return {sourceYear:null,items:[]};
  const source = await getWorkspaceForScope(companyId,destination.sourceYear);
  return withAnnualBaseConnection(async c=> {
    const t = (table:string)=>quoteIdentifier(source.storage==='base'?table:namespaceTable(source.id,table));
    const items = await annualRows(c,`SELECT id,processId,sourceType,sourceId,sourceSubId,title,dueDate,status FROM ${t('linkedCommitments')} WHERE companyId=? AND sourceType IN ('program_action','inspection_finding') AND status NOT IN ('completed','cancelled')`,[companyId]);
    const programActions = await annualRows(c,`SELECT id,programId,action,responsible,implementationDate,completed FROM ${t('programActions')} WHERE companyId=? AND completed=0`,[companyId]);
    const inspectionFindings = await annualRows(c,`SELECT id,sourceId,finding,closureTask,targetDate,completed FROM ${t('operationalFindings')} WHERE companyId=? AND sourceType='inspection' AND completed=0`,[companyId]);
    return {sourceYear:source.year,sourceWorkspaceId:source.id,readOnly:true,items,programActions,inspectionFindings};
  });
}
