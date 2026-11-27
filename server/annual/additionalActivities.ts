import { TRPCError } from '@trpc/server';
import type { PoolConnection } from 'mysql2/promise';
import { COMMITMENT_SOURCE_TABLES, namespaceTable, quoteIdentifier } from './manifest';
import { annualRows, withAnnualBaseConnection, workspaceOnConnection } from './store';
import type { AnnualWorkspaceRecord } from './store';
import { companyOwnershipPredicate } from './migration';
import type { ConsolidatedScheduleActivity } from '../lib/consolidatedScheduleActivities';

const fail = (message:string):never => { throw new TRPCError({code:'PRECONDITION_FAILED',message}); };
const tableName = (w:AnnualWorkspaceRecord,t:string) => quoteIdentifier(w.storage==='base'?t:namespaceTable(w.id,t));
export async function historicalCommitmentWorkspace(c:PoolConnection,current:AnnualWorkspaceRecord,id:number):Promise<AnnualWorkspaceRecord> {
  if (!Number.isSafeInteger(id) || id<=0) return fail('Workspace de fuente histórica inválido');
  const [metadata]=await annualRows(c,'SELECT companyId,year FROM annualWorkspaces WHERE id=?',[id]);
  if (!metadata || Number(metadata.companyId)!==current.companyId || Number(metadata.year)>=current.year) return fail('Fuente histórica no pertenece a la empresa/año anterior exacto');
  const workspace=await workspaceOnConnection(c,current.companyId,Number(metadata.year));
  if (workspace.id!==id) return fail('La identidad del workspace histórico cambió');
  return workspace;
}
async function exactRow(c:PoolConnection,w:AnnualWorkspaceRecord,table:string,id:unknown) {
  if (!Number.isSafeInteger(Number(id)) || Number(id)<=0) return fail(`Falta ID exacto ${table}`);
  const rows=await annualRows(c,`SELECT r.* FROM ${tableName(w,table)} r WHERE r.id=? AND ${companyOwnershipPredicate(w,table)} FOR SHARE`,[id]);
  if (rows.length!==1) return fail(`Fuente exacta ${w.year}/${table}:${id} ausente o de otra empresa`);
  return rows[0];
}
export async function exactCommitmentReference(c:PoolConnection,current:AnnualWorkspaceRecord,row:Record<string,any>) {
  if (row.sourceType==='own') {
    if (row.sourceId!=null || row.sourceSubId!=null || row.sourceWorkspaceId!=null) return fail('Compromiso own con referencia polimórfica contradictoria');
    return null;
  }
  const tables=COMMITMENT_SOURCE_TABLES[row.sourceType];
  if (!tables) return fail(`Fuente polimórfica desconocida ${row.sourceType}`);
  const w=row.sourceWorkspaceId!=null ? await historicalCommitmentWorkspace(c,current,Number(row.sourceWorkspaceId)) : current;
  const entity=await exactRow(c,w,tables[0],row.sourceId);
  const parent=await exactRow(c,w,tables[1],row.sourceSubId);
  const parentColumn:Record<string,string>={checklist_action:'checklistItemId',program_action:'programId',meeting_agreement:'meetingId',change_action:'changeId'};
  const column=parentColumn[row.sourceType];
  if (column && Number(entity[column])!==Number(parent.id)) return fail('Padre polimórfico no coincide con sourceSubId exacto');
  if (['audit_finding','inspection_finding'].includes(row.sourceType)) {
    const expected=row.sourceType==='audit_finding'?'audit':'inspection';
    if (entity.sourceType!==expected || Number(entity.id)!==Number(parent.id)) return fail('Tipo de hallazgo/sourceSubId no coincide');
    await exactRow(c,w,expected==='audit'?'audits':'inspections',entity.sourceId);
  }
  if (['checklist_vigency','company_compliance'].includes(row.sourceType) && Number(entity.id)!==Number(parent.id)) return fail('Identidad de fuente/vigencia no coincide');
  return {workspaceId:w.id,year:w.year,sourceType:row.sourceType,entity:{table:tables[0],id:Number(entity.id),row:entity},parent:{table:tables[1],id:Number(parent.id),row:parent}};
}
/** Snapshot backs the exact schedule activity with complete SQL definitions and evidence.
 * Definitions not visible in the schedule must still invalidate stale approval. */
export async function additionalActivitySnapshot(w:AnnualWorkspaceRecord,activity:ConsolidatedScheduleActivity,c?:PoolConnection):Promise<any> {
  const read=async(connection:PoolConnection)=> {
    if (activity.navigation.destination==='linked_commitment') {
      const commitment=await exactRow(connection,w,'linkedCommitments',activity.navigation.commitmentId);
      const reference=await exactCommitmentReference(connection,w,commitment);
      const evidence=await annualRows(connection,`SELECT * FROM ${tableName(w,'linkedCommitmentEvidence')} WHERE linkedCommitmentId=? AND companyId=? ORDER BY id FOR SHARE`,[commitment.id,w.companyId]);
      return {workspaceId:w.id,year:w.year,commitment,reference,evidence};
    }
    if (activity.navigation.destination==='output_release') {
      const period=await exactRow(connection,w,'processOutputReleasePeriods',activity.navigation.periodId);
      const control=await exactRow(connection,w,'processOutputReleaseControls',activity.navigation.controlId);
      if (Number(period.controlId)!==Number(control.id) || Number(period.processId)!==Number(control.processId)) return fail('Periodo/control de salida no coincide exactamente');
      const evidence=await annualRows(connection,`SELECT * FROM ${tableName(w,'processOutputReleaseEvidence')} WHERE periodId=? AND companyId=? ORDER BY id FOR SHARE`,[period.id,w.companyId]);
      return {workspaceId:w.id,year:w.year,control,period,evidence};
    }
    return fail('Snapshot adicional solicitado para otro tipo de cronograma');
  };
  return c ? read(c) : withAnnualBaseConnection(read);
}
/** Keep month/day exactly in the selected target year; never normalize Feb 29 or guess custom period keys. */
export function additionalDateInYear(value:unknown,year:number):string {
  const date=value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Fecha anual inválida');
  const result=`${year}${date.slice(4)}`;
  const parsed=new Date(`${result}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10)!==result) return fail('La fecha seleccionada no existe en el año destino; requiere revisión explícita');
  return result;
}
export function resetAdditionalCommitment(row:Record<string,any>,target:AnnualWorkspaceRecord,reference:any) {
  return {...structuredClone(row),sourceWorkspaceId:row.sourceType==='own'?null:reference.workspaceId,dueDate:row.dueDate?additionalDateInYear(row.dueDate,target.year):null,status:'pending',completedAt:null,renewedValidFrom:null,renewedValidUntil:null,notes:null};
}
export function resetAdditionalPeriod(row:Record<string,any>,targetYear:number) {
  const scheduledDate=additionalDateInYear(row.scheduledDate,targetYear);
  const sourceDate=row.scheduledDate instanceof Date ? row.scheduledDate.toISOString().slice(0,10) : String(row.scheduledDate).slice(0,10);
  // Opaque keys remain exact under namespace; canonical date keys move with the date.
  const periodKey=row.periodKey===`scheduled:${sourceDate}`?`scheduled:${scheduledDate}`:row.periodKey;
  return {...structuredClone(row),periodKey,scheduledDate,status:'pending',releasedAt:null,releasedByAccountId:null,observations:null};
}
