import { createHash } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import type { PoolConnection } from 'mysql2/promise';
import {
  ANNUAL_TABLE_MANIFEST, BUSINESS_TABLE_NAMES, MANIFEST_BY_TABLE,
  COMMITMENT_SOURCE_TABLES, namespaceTable, quoteIdentifier,
} from './manifest';
import { annualRows, retainFileOnConnection } from './store';
import type { AnnualWorkspaceRecord } from './store';
import { runInAnnualScope } from './runtime';
import { getConsolidatedScheduleActivities } from '../lib/consolidatedScheduleActivities';
import { additionalActivitySnapshot, exactCommitmentReference, resetAdditionalCommitment, resetAdditionalPeriod } from './additionalActivities';

export type AnnualRow = Record<string,any>;
export type AnnualDataset = Map<string,AnnualRow[]>;
const fail = (message:string):never => { throw new TRPCError({code:'PRECONDITION_FAILED',message}); };
const physical = (w:AnnualWorkspaceRecord,t:string)=>quoteIdentifier(w.storage==='base'?t:namespaceTable(w.id,t));
function canonical(value:any):any {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
export function annualHash(value:unknown):string { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
export function parseAnnualJson(value:unknown,label:string):any {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return structuredClone(value);
  try { return JSON.parse(value); } catch { return fail(`JSON inválido en ${label}; no se permite migración aproximada`); }
}
/** Tenant SQL predicates are built only from this explicit manifest, never inferred by name. */
export function companyOwnershipPredicate(w:AnnualWorkspaceRecord,table:string,alias='r',seen=new Set<string>()):string {
  if (seen.has(table)) throw new Error(`Dependencia circular de propiedad ${table}`);
  const next = new Set(seen).add(table);
  const entry = MANIFEST_BY_TABLE.get(table);
  const owner = entry?.ownership;
  if (!owner || entry?.policy==='shared') throw new Error(`Tabla sin propiedad anual ${table}`);
  const col = (name:string)=>`${alias}.${quoteIdentifier(name)}`;
  const child = (parentTable:string,column:string)=>`${col(column)} IN (SELECT p.id FROM ${physical(w,parentTable)} p WHERE ${companyOwnershipPredicate(w,parentTable,'p',next)})`;
  if (owner.kind==='company') return `${col(owner.column || 'companyId')}=${w.companyId}`;
  if (owner.kind==='process') return child('processes',owner.column || 'processId');
  if (owner.kind==='parent') return child(owner.table,owner.column);
  if (owner.kind==='characterization') {
    return `(${child('processCharacterizations',owner.column)} OR ${child('processes',owner.column)})`;
  }
  if (owner.kind==='finding') return `${col('companyId')}=${w.companyId}`;
  throw new Error('Propiedad desconocida');
}
async function assertUnambiguousLegacyOwnership(c:PoolConnection,w:AnnualWorkspaceRecord) {
  // Reference can be a characterization PK or logical process PK. If both
  // resolve to different processes, fail instead of copying another company's row.
  for (const table of ['processParticipants','processResources']) {
    const rows = await annualRows(c,`SELECT r.id,r.processCharacterizationId,c.processId canonicalProcessId,p.id legacyProcessId FROM ${physical(w,table)} r LEFT JOIN ${physical(w,'processCharacterizations')} c ON c.id=r.processCharacterizationId LEFT JOIN ${physical(w,'processes')} p ON p.id=r.processCharacterizationId WHERE ${companyOwnershipPredicate(w,table)} AND c.processId IS NOT NULL AND p.id IS NOT NULL AND c.processId<>p.id`);
    if (rows.length) fail(`Propietario de caracterización ambiguo en ${table}, id ${rows[0].id}; requiere resolución explícita`);
  }
}
export async function readCompanyDataset(c:PoolConnection,w:AnnualWorkspaceRecord):Promise<AnnualDataset> {
  await assertUnambiguousLegacyOwnership(c,w);
  const dataset:AnnualDataset = new Map();
  for (const table of BUSINESS_TABLE_NAMES) {
    let predicate = companyOwnershipPredicate(w,table);
    // Legacy policyId=companyId is supported only after an explicit unambiguous
    // canonical policy parent can be proven. Never silently OR a foreign policy.
    if (table==='policyObjectives' && w.storage==='base') {
      const policyOwners = await annualRows(c,'SELECT id,companyId FROM policies WHERE id=?',[w.companyId]);
      if (policyOwners.some(p=>Number(p.companyId)!==w.companyId)) {
        const [legacy] = await annualRows(c,'SELECT id FROM policyObjectives WHERE policyId=? LIMIT 1',[w.companyId]);
        if (legacy) fail('policyId coincide con empresa y política de otra empresa; propiedad ambigua');
      } else predicate = `(${predicate} OR r.policyId=${w.companyId})`;
    }
    dataset.set(table,await annualRows(c,`SELECT r.* FROM ${physical(w,table)} r WHERE ${predicate} FOR SHARE`));
  }
  return dataset;
}
/** DDL is additive, before transaction. Failed namespaces stay private preparing. */
export async function prepareNamespace(c:PoolConnection,source:AnnualWorkspaceRecord,target:AnnualWorkspaceRecord):Promise<void> {
  for (const table of BUSINESS_TABLE_NAMES) {
    const name = quoteIdentifier(namespaceTable(target.id,table));
    // LIKE does not copy FKs. The source table schema is not modified.
    await c.query(`CREATE TABLE IF NOT EXISTS ${name} LIKE ${quoteIdentifier(table)}`);
    const [max] = await annualRows(c,`SELECT COALESCE(MAX(id),0) maxId FROM ${physical(source,table)}`);
    const next = Number(max.maxId)+1;
    if (!Number.isSafeInteger(next) || next<=0) throw new Error('Reserva AUTO_INCREMENT inválida');
    await c.query(`ALTER TABLE ${name} AUTO_INCREMENT=${next}`);
  }
}
function ids(data:AnnualDataset,table:string):Set<number> { return new Set((data.get(table)||[]).map(r=>Number(r.id))); }
function rowById(data:AnnualDataset,table:string,id:any):AnnualRow {
  const rows = (data.get(table)||[]).filter(r=>Number(r.id)===Number(id));
  if (rows.length!==1) return fail(`Dependencia ${table}:${id} ausente o ambigua en el workspace`);
  return rows[0];
}
function knownJsonReferences(row:AnnualRow,table:string,data:AnnualDataset):void {
  if (table==='processFODA') {
    for (const column of ['strengths','opportunities','weaknesses','threats','matrixData']) {
      if (column!=='matrixData' && typeof row[column]==='string' && !/^[\s]*[\[{]/.test(row[column])) continue;
      const parsed = parseAnnualJson(row[column],`${table}.${column}`);
      // Some legacy FODA definitions are plain text. Only explicitly structured
      // fields can be admitted for new plan materialization.
      if (parsed === null) continue;
      const visit = (v:any) => {
        if (!v || typeof v!=='object') return;
        if (v.policyObjectiveId !== undefined && v.policyObjectiveId !== null && v.policyObjectiveId !== '') rowById(data,'policyObjectives',v.policyObjectiveId);
        for (const value of Object.values(v)) if (typeof value==='object') visit(value);
      };
      visit(parsed);
    }
  }
  if (table==='stakeholderSurveys' && row.linkedActionIds) {
    const actionIds = parseAnnualJson(row.linkedActionIds,'stakeholderSurveys.linkedActionIds');
    if (!Array.isArray(actionIds)) fail('linkedActionIds no es un array de identidades');
    for (const id of actionIds) rowById(data,'criticalityMatrix',id);
  }
}
/** All scalar parents must exist in the same dataset/workspace. Snapshot mode
 * keeps malformed legacy references verbatim; annual new plans never guess. */
export function validateAnnualDependencies(data:AnnualDataset,historicalReferences:Map<number,any>=new Map()):void {
  for (const [table,rows] of Array.from(data)) {
    const spec = MANIFEST_BY_TABLE.get(table)!;
    for (const row of rows) {
      for (const dep of spec.parents || []) if (row[dep.column] !== null && row[dep.column] !== undefined && row[dep.column] !== 0) rowById(data,dep.table,row[dep.column]);
      if (spec.ownership?.kind==='parent') rowById(data,spec.ownership.table,row[spec.ownership.column]);
      if (spec.ownership?.kind==='process') rowById(data,'processes',row[spec.ownership.column||'processId']);
      if (spec.ownership?.kind==='characterization') {
        const ref = Number(row[spec.ownership.column]);
        const chars=(data.get('processCharacterizations')||[]).filter(r=>Number(r.id)===ref);
        const processes=(data.get('processes')||[]).filter(r=>Number(r.id)===ref);
        if ((!chars.length && !processes.length) || (chars.length && processes.length && Number(chars[0].processId)!==ref)) fail(`Caracterización ambigua ${table}:${row.id}`);
      }
      if (table==='subprocessMaps') {
        for (const column of ['entrada','subprocesos','salida']) if (row[column]) {
          const payload=parseAnnualJson(row[column],`subprocessMaps.${column}`);
          if (!Array.isArray(payload)) fail(`Mapa ${column} no contiene array canónico`);
          const localIds=payload.filter((r:any)=>r?.id!==undefined).map((r:any)=>String(r.id));
          if (new Set(localIds).size!==localIds.length) fail(`IDs locales duplicados en mapa ${column}`);
        }
      }
      if (table==='policyObjectives') rowById(data,'policies',row.policyId);
      if (table==='operationalFindings' || table==='operationalFindingBaselines') rowById(data,row.sourceType==='audit'?'audits':'inspections',row.sourceId);
      if (table==='linkedCommitments' && row.sourceType!=='own') {
        const sourceTables = COMMITMENT_SOURCE_TABLES[row.sourceType];
        if (!sourceTables) fail(`Fuente polimórfica no reconocida ${row.sourceType}`);
        if (row.sourceWorkspaceId!=null) {
          const ref=historicalReferences.get(Number(row.id));
          if (!ref || Number(ref.workspaceId)!==Number(row.sourceWorkspaceId) || ref.sourceType!==row.sourceType || ref.entity.table!==sourceTables[0] || Number(ref.entity.id)!==Number(row.sourceId) || ref.parent.table!==sourceTables[1] || Number(ref.parent.id)!==Number(row.sourceSubId)) fail(`Compromiso ${row.id} sin referencia histórica exacta validada`);
        } else {
          rowById(data,sourceTables[0],row.sourceId); rowById(data,sourceTables[1],row.sourceSubId);
          if (row.sourceType==='audit_finding' && rowById(data,'operationalFindings',row.sourceId).sourceType!=='audit') fail('Hallazgo de auditoría enlaza otra clase de fuente');
        }
      }
      if (table==='organizationChartNodes' && row.parentNodeId) {
        const parents=rows.filter(p=>p.chartId===row.chartId && p.nodeId===row.parentNodeId);
        if (parents.length!==1) fail(`Padre de organigrama ambiguo ${row.id}`);
      }
      if (table==='processFODA' || table==='stakeholderSurveys') knownJsonReferences(row,table,data);
    }
  }
}
export function canonicalizePolicyParents(source:AnnualDataset,companyId:number):void {
  const policies = source.get('policies') || [];
  for (const objective of source.get('policyObjectives') || []) {
    const parents = policies.filter(p=>Number(p.id)===Number(objective.policyId));
    if (parents.length===1) continue;
    if (Number(objective.policyId)===companyId && policies.length===1) objective.policyId=policies[0].id;
    else fail(`policyObjectives:${objective.id} requiere política canónica inequívoca; no se elige first/latest`);
  }
}
function copy(row:AnnualRow):AnnualRow { return structuredClone(row); }
function clearFields(row:AnnualRow,fields:string[],value:any='') { for (const field of fields) if (field in row) row[field]=value; }
/** Explicit execution fields only; unknown JSON fields and logical identities stay intact. */
export function resetApprovedExecution(value:any):any {
  if (Array.isArray(value)) return value.map(resetApprovedExecution);
  if (!value || typeof value!=='object') return value;
  const result:AnnualRow = {};
  const numeric = new Set(['percentageCompleted','porcentajeAlcanzado','avanceMeta','completionPercentage','progress','actualCompletion']);
  const measurementArrays = new Set(['monthlyProgress','monthlyValues','checklistValues','puntualSumValues','ooMonthlyValues','ooChecklistValues','monthlyTrackingValues','monthlyChecklistValues','completedOccurrenceDates']);
  const completion = new Set(['objetivoLogrado','mejoraImplementada','implementacionCumplio','realizado']);
  const observation = new Set(['condicionActual','trackingCurrentValue','currentValue','actualValue','measurementDate','completedAt','evidence','evidencia','observations','observaciones']);
  for (const [key,v] of Object.entries(value)) {
    if (numeric.has(key)) result[key]=0;
    else if (measurementArrays.has(key)) result[key]=[];
    else if (completion.has(key)) result[key]='NO';
    else if (key==='completed') result[key]=typeof v==='boolean'?false:'NO';
    else if (observation.has(key)) result[key]=null;
    else result[key]=resetApprovedExecution(v);
  }
  return result;
}
const corporateBindings = new Set(['company_compliance','audit_finding','checklist_action','checklist_vigency']);
export function newYearDataset(source:AnnualDataset,target:AnnualWorkspaceRecord):AnnualDataset {
  const result:AnnualDataset = new Map(BUSINESS_TABLE_NAMES.map(t=>[t,[]]));
  for (const spec of ANNUAL_TABLE_MANIFEST) {
    if (spec.policy==='shared') continue;
    let rows=(source.get(spec.table)||[]).map(copy);
    if (spec.policy==='pending' || spec.policy==='empty') rows=[];
    if (spec.policy==='strategy') {
      const s=target.strategy;
      if (spec.table==='companyInfo') for (const row of rows) {
        if (!s.purpose) row.proposito=''; if (!s.mission) row.mision=''; if (!s.vision) row.vision='';
      }
      if ((spec.table==='companyValues' && !s.values) || (['policies','policyObjectives'].includes(spec.table) && !s.policy) || (['strategicObjectives','strategicObjectiveMeasurementConfigs'].includes(spec.table) && !s.strategicObjectives)) rows=[];
    }
    if (spec.table==='processCharacterizations') for (const row of rows) clearFields(row,['objective','scope','resources','participants']);
    if (spec.table==='managementPrograms') for (const row of rows) { row.plannedActions=0; row.completedActions=0; }
    if (spec.table==='programActionBaselines') for (const row of rows) { row.legacyPlannedActions=0; row.legacyCompletedActions=0; }
    if (['operationalFindings','operationalFindingBaselines'].includes(spec.table)) rows=rows.filter(r=>r.sourceType==='audit');
    if (spec.table==='linkedCommitments') rows=rows.filter(r=>corporateBindings.has(r.sourceType));
    if (spec.table==='linkedCommitmentEvidence') {
      const retained=ids(result,'linkedCommitments'); rows=rows.filter(r=>retained.has(Number(r.linkedCommitmentId)));
    }
    if (spec.table==='documents') rows=rows.filter(r=> {
      if (r.documentName==='Mapa de Procesos - Imagen') return true;
      if (r.documentType==='Politica') return target.strategy.policy;
      const owner=rowById(source,'processes',r.processId);
      if (owner.name!=='Documentos Generales') return false; // approved process later
      // Published upload stores only the user filename and a mixed enum, not
      // a reliable section association. Preserve when all possible sections
      // are retained; otherwise fail, never guess or silently drop an attachment.
      if (r.documentType==='Varios' || r.documentType==='Programa') {
        if (!target.strategy.values || !target.strategy.strategicObjectives) fail(`Documento general ${r.id} sin sección canónica; requiere atribución explícita antes de aplicar opciones`);
        return true;
      }
      return true;
    });
    result.set(spec.table,rows);
  }
  return result;
}
export async function collectAnnualFileKeys(c:PoolConnection,rows:AnnualRow[],workspaceId:number,reason:string) {
  const visit=async(value:any,path:string):Promise<void> => {
    if (!value || typeof value!=='object') return;
    for (const [column,item] of Object.entries(value)) {
      if ((/filekey$/i.test(column) || column==='evidencePdfKey') && typeof item==='string' && item.trim()) await retainFileOnConnection(c,item,workspaceId,`${reason}:${path}${column}`);
      else if (item && typeof item==='object') await visit(item,`${path}${column}.`);
      else if (typeof item==='string' && /^(\s)*[\[{]/.test(item)) {
        let parsed:any; try { parsed=JSON.parse(item); } catch { continue; }
        await visit(parsed,`${path}${column}.`);
      }
    }
  };
  for (const row of rows) await visit(row,'');
}
async function insertAnnualRow(c:PoolConnection,source:AnnualWorkspaceRecord,target:AnnualWorkspaceRecord,table:string,sourceRow:AnnualRow,destinationRow:AnnualRow,reason:string,decisionIds:number[]=[],reference:unknown=null,allowPlaceholder=false):Promise<void> {
  const targetTable=physical({...target,storage:'namespace'},table);
  const [occupied] = await annualRows(c,`SELECT * FROM ${targetTable} WHERE id=? FOR UPDATE`,[destinationRow.id]);
  const [lineage] = await annualRows(c,'SELECT * FROM annualEntityLineage WHERE workspaceId=? AND tableName=? AND entityId=? FOR UPDATE',[target.id,table,destinationRow.id]);
  if (occupied) {
    // Only a preparing organizational header generated by us can be promoted.
    // Destination user edits or unknown occupied IDs are always rejected.
    if (!allowPlaceholder || !lineage || lineage.reason!=='new-year' || lineage.destinationHash!==annualHash(occupied)) fail(`Colisión de ID anual ${table}:${destinationRow.id}; nunca sobrescribir/IGNORE`);
    const columns=Object.keys(destinationRow).filter(k=>k!=='id');
    await c.query(`UPDATE ${targetTable} SET ${columns.map(k=>quoteIdentifier(k)+'=?').join(',')} WHERE id=?`,[...columns.map(k=>destinationRow[k]),destinationRow.id]);
    await c.query('UPDATE annualEntityLineage SET sourceHash=?,destinationHash=?,reason=?,sourceDecisionIdsJson=?,referenceJson=? WHERE id=?',[annualHash(sourceRow),annualHash(destinationRow),reason,JSON.stringify(decisionIds),reference===null?null:JSON.stringify(reference),lineage.id]);
  } else {
    if (lineage) fail(`Lineage sin entidad destino ${table}:${destinationRow.id}`);
    const columns=Object.keys(destinationRow);
    await c.query(`INSERT INTO ${targetTable} (${columns.map(quoteIdentifier).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,columns.map(k=>destinationRow[k]));
    let sourceYear=source.year, sourceWorkspaceId=source.id;
    if (MANIFEST_BY_TABLE.get(table)?.policy==='training-history' && source.storage==='namespace') {
      const [origin]=await annualRows(c,'SELECT sourceYear,sourceWorkspaceId FROM annualEntityLineage WHERE workspaceId=? AND tableName=? AND entityId=?',[source.id,table,sourceRow.id]);
      if (origin) { sourceYear=Number(origin.sourceYear); sourceWorkspaceId=Number(origin.sourceWorkspaceId); }
    }
    await c.query('INSERT INTO annualEntityLineage(workspaceId,tableName,entityId,sourceWorkspaceId,sourceYear,sourceTableName,sourceEntityId,sourceHash,destinationHash,reason,sourceDecisionIdsJson,referenceJson) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[target.id,table,destinationRow.id,sourceWorkspaceId,sourceYear,table,sourceRow.id,annualHash(sourceRow),annualHash(destinationRow),reason,JSON.stringify(decisionIds),reference===null?null:JSON.stringify(reference)]);
  }
  await collectAnnualFileKeys(c,[destinationRow],target.id,`${table}:${destinationRow.id}`);
}
export async function copyWorkspaceRows(c:PoolConnection,source:AnnualWorkspaceRecord,target:AnnualWorkspaceRecord,mode:'new-year'|'snapshot'):Promise<void> {
  const original=await readCompanyDataset(c,source);
  // Retain ALL origin keys, including empty/new-year excluded tables and pending
  // program/inspection evidence. No source object gets deleted on rollover.
  for (const [table,rows] of Array.from(original)) await collectAnnualFileKeys(c,rows,source.id,`source:${table}`);
  const normalized:AnnualDataset=new Map(Array.from(original).map(([t,r])=>[t,r.map(copy)]));
  if (mode==='new-year') canonicalizePolicyParents(normalized,source.companyId);
  const destination=mode==='snapshot'?normalized:newYearDataset(normalized,target);
  if (mode==='new-year') {
    const references=new Map<number,any>();
    for (const row of destination.get('linkedCommitments')||[]) if (row.sourceWorkspaceId!=null) references.set(Number(row.id),await exactCommitmentReference(c,source,row));
    validateAnnualDependencies(destination,references);
  }
  for (const [table,rows] of Array.from(destination)) for (const row of rows) await insertAnnualRow(c,source,target,table,rowById(original,table,row.id),row,mode);
}
function processRows(data:AnnualDataset,table:string,processId:number):AnnualRow[] {
  const rows=data.get(table)||[];
  const spec=MANIFEST_BY_TABLE.get(table)!;
  if (spec.ownership?.kind==='process') { const column=spec.ownership.column || 'processId'; return rows.filter(r=>Number(r[column])===processId); }
  if (spec.ownership?.kind==='characterization') {
    const charIds=new Set((data.get('processCharacterizations')||[]).filter(r=>Number(r.processId)===processId).map(r=>Number(r.id)));
    return rows.filter(r=>charIds.has(Number(r.processCharacterizationId)) || Number(r.processCharacterizationId)===processId);
  }
  if (spec.ownership?.kind==='parent') {
    const parentIds=new Set(processRows(data,spec.ownership.table,processId).map(r=>Number(r.id)));
    return rows.filter(r=>parentIds.has(Number(r[(spec.ownership as {column:string}).column])));
  }
  return rows.filter(r=>Number(r.processId)===processId);
}
function requireExactIdentity(rows:any[],id:any,index:any,label:string):any {
  if (id===undefined || id===null || id==='') return fail(`Falta identidad exacta ${label}; índice no sustituye ID`);
  const matches=rows.filter(r=>String(r.id)===String(id));
  if (matches.length!==1 || (index!==undefined && rows[index]!==matches[0])) return fail(`Identidad ${label} ausente/ambigua o cambió desde aprobación`);
  return matches[0];
}
function comparableActivity(activity:any):any {
  const result=copy(activity); delete result.daysRemaining;
  return result;
}
/** Materializes task identities from actual approval decisions. No close/review
 * items, no whole-plan masquerading as selected actions, no source-cycle close.
 */
export async function incorporateProcessRows(c:PoolConnection,source:AnnualWorkspaceRecord,target:AnnualWorkspaceRecord,processId:number,cycle:AnnualRow,decisions:AnnualRow[]):Promise<string> {
  const data=await readCompanyDataset(c,source);
  const normalized:AnnualDataset=new Map(Array.from(data).map(([t,r])=>[t,r.map(copy)]));
  canonicalizePolicyParents(normalized,source.companyId);
  const currentActivities=await runInAnnualScope(source,()=>getConsolidatedScheduleActivities(processId));
  const currentByKey=new Map(currentActivities.filter(a=>['stakeholder','foda','objective','compliance','linked_commitment','output_release'].includes(a.type)).map(a=>[`schedule:${a.id}`,a]));
  const approvedKeys=new Set(decisions.filter(d=>d.itemType!=='participant_kpi').map(d=>d.sourceItemKey));
  if (approvedKeys.size!==decisions.filter(d=>d.itemType!=='participant_kpi').length) fail('Identidades de actividad duplicadas en las decisiones aprobadas');
  for (const key of Array.from(currentByKey.keys())) if (!approvedKeys.has(key)) fail(`Apareció actividad ${key} después de preparar/aprobar; debe revisar el ciclo`);
  // The published decision payload contains exact activity identity but not
  // every parent definition. Reject parent edits newer than preparation rather
  // than silently migrating changed definitions under an old approval.
  const preparedAt=decisions.length ? Math.min(...decisions.map(d=>new Date(d.createdAt).getTime())) : new Date(cycle.preparedAt || cycle.managerReviewedAt).getTime();
  for (const table of ['processCharacterizations','subprocessMaps','processResources','procedures','processFODA','processTacticalObjectives','criticalityMatrix','participantWorkerKpis','processOutputReleaseControls']) {
    for (const row of processRows(data,table,processId)) {
      if (row.updatedAt && new Date(row.updatedAt).getTime()>preparedAt) fail(`Fuente ${table}:${row.id} cambió desde preparación/aprobación; debe revisar el snapshot`);
    }
  }
  const selected:AnnualDataset=new Map(BUSINESS_TABLE_NAMES.map(t=>[t,[]]));
  // Organizational headers preserved at create are promoted only after approval.
  selected.set('processCharacterizations',processRows(normalized,'processCharacterizations',processId).map(copy));
  for (const table of ['subprocesses','subprocessMaps','subprocessMapEntries','subprocessMapSubprocesses','subprocessMapOutputs','processResources','procedures','procedureRecords','processRiskMatrices','processStakeholderMatrixFiles','meetingTypes']) selected.set(table,processRows(normalized,table,processId).map(copy));
  // Stakeholders preserve their definition, not stored action/achievement arrays.
  selected.set('stakeholders',processRows(normalized,'stakeholders',processId).map(r=>({...copy(r),actions:null})));
  const refs = new Map<string,any>();
  const decisionIds = new Map<string,number[]>();
  const addDecision=(table:string,id:number,d:number)=> {
    const k=`${table}:${id}`; decisionIds.set(k,[...(decisionIds.get(k)||[]),d]);
  };
  const oteMap=new Map<number,AnnualRow>();
  const fodaMap=new Map<number,AnnualRow>();
  const gpiIds=new Set<number>();
  const complianceDecisions=new Map<number,Array<{decision:AnnualRow;navigation:any}>>();
  const preservedCommitments=new Set<number>();
  const controls=new Map<number,AnnualRow>();
  for (const decision of decisions) {
    if (decision.decidedAt && new Date(decision.decidedAt)>new Date(cycle.managerReviewedAt)) fail(`Decisión ${decision.id} cambió después de aprobación gerencial`);
    const payload=parseAnnualJson(decision.sourcePayloadJson,`decision:${decision.id}`);
    if (!payload || typeof payload!=='object') fail(`Payload aprobado inválido ${decision.id}`);
    if (decision.itemType==='participant_kpi') {
      const sourceKpi=rowById(data,'participantWorkerKpis',payload.id);
      if (String(payload.id)!==String(decision.sourceItemKey) || annualHash(sourceKpi)!==annualHash(payload)) fail(`KPI ${decision.id} cambió desde el snapshot de aprobación`);
      if (decision.decision==='migrate') {
        if (!processRows(data,'participantWorkerKpis',processId).some(r=>r.id===sourceKpi.id)) fail('KPI pertenece a otro proceso');
        selected.get('participantWorkerKpis')!.push({...copy(sourceKpi),year:target.year}); addDecision('participantWorkerKpis',sourceKpi.id,decision.id);
      }
      continue;
    }
    const activity=payload.activity;
    const current=currentByKey.get(decision.sourceItemKey);
    if (payload.source!=='consolidated_schedule' || !activity?.navigation || !current || annualHash(comparableActivity(current))!==annualHash(comparableActivity(activity))) fail(`Fuente ${decision.sourceItemKey} difiere del snapshot aprobado; debe revisar, no se oculta el cambio`);
    if (['linked_commitment','output_release'].includes(decision.itemType)) {
      if (activity.type!==decision.itemType || activity.navigation.destination!==decision.itemType) fail('Tipo de decisión adicional no coincide con fuente/navegación exacta');
      const snapshot=await additionalActivitySnapshot(source,current!,c);
      if (!payload.annualSource || annualHash(snapshot)!==annualHash(payload.annualSource)) fail(`Fuente adicional ${decision.sourceItemKey} cambió desde preparación/aprobación; debe revisar el snapshot`);
      if (decision.itemType==='linked_commitment') {
        const row=rowById(data,'linkedCommitments',activity.navigation.commitmentId);
        if (Number(row.processId)!==processId) fail('Compromiso pertenece a otro proceso');
        const [existing]=await annualRows(c,`SELECT * FROM ${physical(target,'linkedCommitments')} WHERE id=? FOR UPDATE`,[row.id]);
        if (existing) {
          const [lineage]=await annualRows(c,'SELECT * FROM annualEntityLineage WHERE workspaceId=? AND tableName=? AND entityId=? FOR UPDATE',[target.id,'linkedCommitments',row.id]);
          if (!corporateBindings.has(row.sourceType) || !lineage || lineage.reason!=='new-year' || Number(lineage.sourceWorkspaceId)!==source.id || lineage.sourceHash!==annualHash(row) || lineage.destinationHash!==annualHash(existing)) fail(`Colisión de ID anual linkedCommitments:${row.id}; destino no coincide con copia preservada`);
          const evidence=await annualRows(c,`SELECT * FROM ${physical(target,'linkedCommitmentEvidence')} WHERE linkedCommitmentId=? AND companyId=? ORDER BY id FOR UPDATE`,[row.id,target.companyId]);
          if (annualHash(evidence)!==annualHash(snapshot.evidence)) fail(`Evidencia destino del compromiso ${row.id} cambió; no se sobrescribe una ejecución nueva`);
          for (const item of evidence) {
            const [evidenceLineage]=await annualRows(c,'SELECT sourceWorkspaceId,sourceHash,destinationHash,reason FROM annualEntityLineage WHERE workspaceId=? AND tableName=? AND entityId=? FOR UPDATE',[target.id,'linkedCommitmentEvidence',item.id]);
            if (!evidenceLineage || evidenceLineage.reason!=='new-year' || Number(evidenceLineage.sourceWorkspaceId)!==source.id || evidenceLineage.sourceHash!==annualHash(item) || evidenceLineage.destinationHash!==annualHash(item)) fail('Evidencia corporativa destino sin procedencia exacta intacta');
          }
          preservedCommitments.add(Number(row.id));
        }
        if (decision.decision==='migrate') {
          const reference=snapshot.reference;
          selected.get('linkedCommitments')!.push(resetAdditionalCommitment(row,target,reference));
          refs.set(`linkedCommitments:${row.id}`,{source:reference,sourceEvidence:snapshot.evidence.map((e:any)=>({workspaceId:source.id,table:'linkedCommitmentEvidence',id:e.id,fileKey:e.fileKey})),execution:'new-pending'});
          addDecision('linkedCommitments',row.id,decision.id);
        } else if (existing) preservedCommitments.delete(Number(row.id));
      } else {
        const control=rowById(data,'processOutputReleaseControls',activity.navigation.controlId);
        const period=rowById(data,'processOutputReleasePeriods',activity.navigation.periodId);
        if (Number(control.processId)!==processId || Number(period.processId)!==processId || Number(period.controlId)!==Number(control.id)) fail('Periodo/control pertenece a otro proceso');
        if (decision.decision==='migrate') {
          controls.set(Number(control.id),copy(control));
          selected.get('processOutputReleasePeriods')!.push(resetAdditionalPeriod(period,target.year));
          addDecision('processOutputReleaseControls',control.id,decision.id);
          addDecision('processOutputReleasePeriods',period.id,decision.id);
          refs.set(`processOutputReleasePeriods:${period.id}`,{control:{workspaceId:target.id,table:'processOutputReleaseControls',id:control.id},sourceEvidence:snapshot.evidence.map((e:any)=>({workspaceId:source.id,table:'processOutputReleaseEvidence',id:e.id,fileKey:e.fileKey})),execution:'new-pending'});
        }
      }
      continue;
    }
    if (decision.decision!=='migrate') continue;
    const nav=activity.navigation;
    if (decision.itemType==='ote') {
      if (nav.destination!=='objective') fail('Tipo de decisión OTE no coincide con navegación');
      const objective=rowById(normalized,'processTacticalObjectives',nav.objectiveId);
      if (Number(objective.processId)!==processId) fail('OTE pertenece a otro proceso');
      const plan=parseAnnualJson(objective.planningData,'OTE.planningData');
      if (!Array.isArray(plan?.resultKeys)) fail('OTE sin planificación exacta');
      const oo=requireExactIdentity(plan.resultKeys,nav.resultKeyId,nav.resultKeyIndex,'OO');
      let destination=oteMap.get(objective.id);
      if (!destination) {
        destination={...copy(objective),completed:'NO',planningData:{...resetApprovedExecution(plan),resultKeys:[]}};
        oteMap.set(objective.id,destination);
        const matches=(normalized.get('strategicObjectives')||[]).filter(o=>o.objective===objective.strategicObjective);
        const destinationOes=await annualRows(c,`SELECT id,objective FROM ${physical(target,'strategicObjectives')} WHERE companyId=?`,[target.companyId]);
        if (objective.strategicObjective && (matches.length!==1 || !destinationOes.some(o=>Number(o.id)===Number(matches[0].id)))) fail(`OE de OTE ${objective.id} no retenido o ambiguo; no fallback2026`);
        refs.set(`processTacticalObjectives:${objective.id}`,{strategicObjective:matches.length?{workspaceId:target.id,table:'strategicObjectives',id:matches[0].id}:null});
      }
      let selectedOo=destination.planningData.resultKeys.find((o:any)=>String(o.id)===String(oo.id));
      if (!selectedOo) { selectedOo={...resetApprovedExecution(oo),tasks:[]}; destination.planningData.resultKeys.push(selectedOo); }
      if (nav.taskId!==undefined) {
        const task=requireExactIdentity(oo.tasks||[],nav.taskId,nav.taskIndex,'tarea OTE');
        if (!selectedOo.tasks.some((t:any)=>String(t.id)===String(task.id))) selectedOo.tasks.push(resetApprovedExecution(task));
      } else if ((oo.tasks||[]).length) fail('Decisión de OO no autoriza implícitamente todas sus tareas');
      addDecision('processTacticalObjectives',objective.id,decision.id);
    } else if (decision.itemType==='otg') {
      if (nav.destination!=='foda') fail('Tipo OTG no coincide con navegación');
      const sourceFoda=rowById(normalized,'processFODA',nav.fodaRecordId);
      if (Number(sourceFoda.processId)!==processId) fail('FODA pertenece a otro proceso');
      const matrix=parseAnnualJson(sourceFoda.matrixData,'FODA.matrixData');
      if (!Array.isArray(matrix)) fail('OTG sin matriz exacta');
      const matrixRow=requireExactIdentity(matrix,nav.fodaRowId,nav.fodaRowIndex,'fila OTG');
      // Published schedule identifies the exact matrix row (its action). An
      // embedded acciones list has no action identity in the old payload.
      if (Array.isArray(matrixRow.acciones) && matrixRow.acciones.length) fail('OTG contiene acciones anidadas sin identidad aprobada exacta; revisar payload');
      let destination=fodaMap.get(sourceFoda.id);
      if (!destination) { destination={...copy(sourceFoda),matrixData:[]}; fodaMap.set(sourceFoda.id,destination); }
      if (!destination.matrixData.some((r:any)=>String(r.id)===String(matrixRow.id))) destination.matrixData.push(resetApprovedExecution(matrixRow));
      addDecision('processFODA',sourceFoda.id,decision.id);
    } else if (decision.itemType==='stakeholder_action') {
      if (nav.destination!=='stakeholder') fail('Tipo GPI no coincide con navegación');
      const row=rowById(normalized,'criticalityMatrix',nav.criticalityId);
      if (Number(row.processId)!==processId) fail('GPI pertenece a otro proceso');
      if (!gpiIds.has(row.id)) {
        if (row.surveyId) fail('GPI depende de encuesta histórica no admitida: requiere referencia histórica explícita');
        selected.get('criticalityMatrix')!.push({...copy(row),implementationStatus:0,completionPercentage:0,observations:null}); gpiIds.add(row.id);
      }
      addDecision('criticalityMatrix',row.id,decision.id);
    } else if (decision.itemType==='compliance') {
      if (nav.destination!=='compliance') fail('Tipo actividad no coincide con navegación');
      const sourceActivity=rowById(normalized,'processCompliances',nav.activityId);
      if (Number(sourceActivity.processId)!==processId) fail('Actividad pertenece a otro proceso');
      const group=complianceDecisions.get(sourceActivity.id)||[]; group.push({decision,navigation:nav}); complianceDecisions.set(sourceActivity.id,group);
    } else fail(`Tipo aprobado no materializable ${decision.itemType}`);
  }
  // Controls are definitions, not execution. Preserve even if none of their
  // periods is selected; closed/review periods themselves never enter 2027.
  for (const row of processRows(data,'processOutputReleaseControls',processId)) controls.set(Number(row.id),copy(row));
  selected.set('processOutputReleaseControls',Array.from(controls.values()));
  for (const row of Array.from(oteMap.values())) selected.get('processTacticalObjectives')!.push({...row,planningData:JSON.stringify(row.planningData)});
  // Preserve definitions of FODA even if no action is migrated, but zero matrix
  // actions. Each selected row references its exact same local UUID/SQL identity.
  for (const row of processRows(normalized,'processFODA',processId)) {
    const transformed=fodaMap.get(row.id)||{...copy(row),matrixData:[]};
    selected.get('processFODA')!.push({...transformed,matrixData:JSON.stringify(transformed.matrixData)});
  }
  for (const [id,group] of Array.from(complianceDecisions)) {
    const all=decisions.filter(d=>d.itemType==='compliance' && parseAnnualJson(d.sourcePayloadJson,'actividad').activity?.navigation?.activityId===id);
    if (group.length!==all.length || all.some(d=>d.decision!=='migrate')) fail(`Actividad recurrente ${id} tiene decisiones mixtas por ocurrencia; no se copia todo el plan disimuladamente`);
    const row=copy(rowById(normalized,'processCompliances',id));
    clearFields(row,['evidence','observations','completedMonths']);
    row.completed='NO'; row.completionPercentage=0; row.trackingCurrentValue=null;
    for (const col of ['monthlyTrackingValues','monthlyChecklistValues','completedOccurrenceDates']) if (col in row) row[col]='[]';
    if (row.status) row.status='Planificado';
    selected.get('processCompliances')!.push(row);
    for (const item of group) addDecision('processCompliances',id,item.decision.id);
  }
  // Validate against actual destination parents, not the entirety of the source.
  const destination=await readCompanyDataset(c,target);
  const resetPreservedCommitments=preservedCommitments;
  destination.set('linkedCommitmentEvidence',(destination.get('linkedCommitmentEvidence')||[]).filter(r=>!resetPreservedCommitments.has(Number(r.linkedCommitmentId))));
  for (const [table,rows] of Array.from(selected)) {
    const replacing=new Set(rows.map(r=>Number(r.id)));
    destination.set(table,[...(destination.get(table)||[]).filter(r=>!replacing.has(Number(r.id))),...rows]);
  }
  // New source organizational rows admitted after workspace creation are
  // inserted only by their exact stable IDs; occupied destination rows are not
  // refreshed or silently overwritten.
  for (const table of ['processParticipants','processParticipantCompetencies','participantWorkerAssignments','companyFODAs','companyFODASelections']) {
    const existingIds=ids(destination,table);
    const sourceRows=processRows(normalized,table,processId);
    for (const row of sourceRows.filter(r=>existingIds.has(Number(r.id)))) {
      const [origin]=await annualRows(c,'SELECT sourceWorkspaceId,sourceEntityId FROM annualEntityLineage WHERE workspaceId=? AND tableName=? AND entityId=?',[target.id,table,row.id]);
      if (!origin || Number(origin.sourceWorkspaceId)!==source.id || Number(origin.sourceEntityId)!==Number(row.id)) fail(`Colisión tardía ${table}:${row.id}; identidad destino no procede del origen`);
    }
    const lateRows=sourceRows.filter(r=>!existingIds.has(Number(r.id))).map(copy);
    selected.set(table,lateRows);
    destination.set(table,[...(destination.get(table)||[]),...lateRows]);
  }
  const existingDocuments=ids(destination,'documents');
  selected.set('documents',processRows(normalized,'documents',processId).filter(r=>!existingDocuments.has(Number(r.id))).map(copy));
  destination.set('documents',[...(destination.get('documents')||[]),...selected.get('documents')!]);
  const historicalReferences=new Map<number,any>();
  for (const row of destination.get('linkedCommitments')||[]) if (row.sourceWorkspaceId!=null) historicalReferences.set(Number(row.id),await exactCommitmentReference(c,target,row));
  validateAnnualDependencies(destination,historicalReferences);
  // Only exact preserved destination rows are changed, inside the incorporation
  // transaction. Source evidence/keys stay retained and referenced in lineage.
  for (const id of Array.from(resetPreservedCommitments)) {
    const evidence=await annualRows(c,`SELECT id FROM ${physical(target,'linkedCommitmentEvidence')} WHERE linkedCommitmentId=? AND companyId=? FOR UPDATE`,[id,target.companyId]);
    for (const row of evidence) await c.query('DELETE FROM annualEntityLineage WHERE workspaceId=? AND tableName=? AND entityId=?',[target.id,'linkedCommitmentEvidence',row.id]);
    await c.query(`DELETE FROM ${physical(target,'linkedCommitmentEvidence')} WHERE linkedCommitmentId=? AND companyId=?`,[id,target.companyId]);
  }
  for (const [table,rows] of Array.from(selected)) for (const row of rows) {
    const sourceRow=rowById(data,table,row.id);
    await collectAnnualFileKeys(c,[sourceRow],source.id,`approved-source:${table}`);
    await insertAnnualRow(c,source,target,table,sourceRow,row,'approved-process',decisionIds.get(`${table}:${row.id}`)||[],refs.get(`${table}:${row.id}`)||null,table==='processCharacterizations' || (table==='linkedCommitments' && preservedCommitments.has(Number(row.id))));
  }
  return annualHash({cycleId:cycle.id,managerReviewedAt:cycle.managerReviewedAt,decisions:decisions.map(d=>({id:d.id,decision:d.decision,sourcePayloadJson:d.sourcePayloadJson}))});
}
