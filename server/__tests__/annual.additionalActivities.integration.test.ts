import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { getDatabasePool } from '../db';
import { assertAnnualIntegrationDatabase } from './helpers/annualTestSafety';
import { createAnnualWorkspace, getWorkspaceForScope, incorporateApprovedProcess, getProcessWorkspaceStatus, closeAnnualWorkspace, PRESERVE_STRATEGY } from '../annual/store';
import { annualHash } from '../annual/migration';
import { namespaceTable, quoteIdentifier } from '../annual/manifest';
import { getConsolidatedScheduleActivities } from '../lib/consolidatedScheduleActivities';
import { runInAnnualScope } from '../annual/runtime';
import { router } from '../_core/trpc';
import { planningCyclesRouter } from '../routers/planningCycles';
import { linkedCommitmentsRouter } from '../routers/linkedCommitments';
import { processOutputReleaseRouter } from '../routers/processOutputRelease';
import { listAnnualHistory } from '../annual/history';

assertAnnualIntegrationDatabase(); // fail before any connection, including module-level pool allocation
const C=998730001, OTHER=998730002, P=998730011, OP=998730012, ADMIN=998730021, ROLE=998730031, R=998730201;
const pool=getDatabasePool();
const q=async(sql:string,args:any[]=[])=>{const [rows]=await pool.query(sql,args);return rows as any;};
const ledger=new Map<string,number[]>();
const workspaces:number[]=[];
let base:any,target:any,sourceHash='';
const ctx=(year=2026)=>({user:{id:ADMIN,role:'admin',name:'Annual extension fixture'},manager:null,processLeader:null,req:{headers:{'x-isge-company-id':String(C),'x-isge-year':String(year)}},res:{}} as any);
const app=router({planningCycles:planningCyclesRouter,linkedCommitments:linkedCommitmentsRouter,processOutputRelease:processOutputReleaseRouter});
const fixtures:Record<string,number[]>={accounts:[ADMIN],account_roles:[ROLE],companies:[C,OTHER],processes:[P,OP],processCharacterizations:[R],managementSystems:[R],managementSystemChecklistItems:[R],managementSystemChecklistActions:[R],managementPrograms:[R],programActions:[R],audits:[R],inspections:[R],operationalFindings:[R,R+1],companyCompliances:[R],meetingTypes:[R],processMeetings:[R],meetingAgreements:[R],changeManagementRecords:[R],changeManagementActions:[R],linkedCommitments:Array.from({length:11},(_,i)=>R+i),linkedCommitmentEvidence:[R,R+1,R+2],processOutputReleaseControls:[R,R+1],processOutputReleasePeriods:[R,R+1,R+2,R+3],processOutputReleaseEvidence:[R],subprocessMaps:[R]};
async function seed(table:string,row:Record<string,any>) {
  if(!fixtures[table]?.includes(row.id))throw Error(`Unregistered fixture ${table}:${row.id}`);
  const keys=Object.keys(row);await q(`INSERT INTO ${quoteIdentifier(table)} (${keys.map(quoteIdentifier).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,keys.map(k=>row[k]));
  ledger.set(table,[...(ledger.get(table)??[]),Number(row.id)]);
}
async function digest(){const rows=[];for(const [table,ids] of Object.entries(fixtures))rows.push([table,await q(`SELECT * FROM ${quoteIdentifier(table)} WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id`,ids)]);return annualHash(rows);}
const t=(table:string)=>quoteIdentifier(namespaceTable(target.id,table));
async function targetDigest(){const rows=[];for(const table of ['processCharacterizations','linkedCommitments','linkedCommitmentEvidence','processOutputReleaseControls','processOutputReleasePeriods','processOutputReleaseEvidence','subprocessMaps'])rows.push([table,await q(`SELECT * FROM ${t(table)} ORDER BY id`)]);rows.push(['lineage',await q('SELECT * FROM annualEntityLineage WHERE workspaceId=? ORDER BY id',[target.id])]);return annualHash(rows);}
async function recordControlRows() {
  const cycles=await q('SELECT id FROM planningCycles WHERE companyId=? AND processId=?',[C,P]);ledger.set('planningCycles',cycles.map((r:any)=>Number(r.id)));
  for(const table of ['planningCycleDecisions','planningCycleSnapshots','planningCycleOperationalItems']) {
    const column=table==='planningCycleSnapshots'?'cycleId':'targetCycleId';
    const ids=cycles.map((r:any)=>r.id);if(ids.length)ledger.set(table,(await q(`SELECT id FROM ${quoteIdentifier(table)} WHERE ${column} IN (${ids.map(()=>'?').join(',')})`,ids)).map((r:any)=>Number(r.id)));
  }
  ledger.set('planningCycleActivations',(await q('SELECT id FROM planningCycleActivations WHERE companyId=?',[C])).map((r:any)=>Number(r.id)));
}

describe('annual additional activities MySQL (exclusive 998730xxx fixtures)',()=>{
  beforeAll(async()=>{
    const [column]=await q("SHOW COLUMNS FROM linkedCommitments LIKE 'sourceWorkspaceId'");if(!column||column.Null!=='YES')throw Error('Coordinate additive sourceWorkspaceId INT NULL DDL before SQL suite');
    const [enumColumn]=await q("SHOW COLUMNS FROM planningCycleDecisions LIKE 'itemType'");if(!enumColumn.Type.includes("'linked_commitment','output_release'"))throw Error('Coordinate additive itemType enums before SQL suite');
    for(const [table,ids] of Object.entries(fixtures))if((await q(`SELECT id FROM ${quoteIdentifier(table)} WHERE id IN (${ids.map(()=>'?').join(',')})`,ids)).length)throw Error(`Fixtures occupied ${table}; no overwrite or cleanup claim`);
    if((await q('SELECT id FROM annualWorkspaces WHERE companyId IN (?,?)',[C,OTHER])).length)throw Error('Fixture company workspace occupied');
    await seed('accounts',{id:ADMIN,openId:'annual-additional-998730',name:'Annual extension fixture',email:'annual-additional-998730@example.invalid',status:'active'});
    const [role]=await q("SELECT id FROM roles WHERE slug='platform_admin'");if(!role)throw Error('Missing canonical platform_admin role');
    await seed('account_roles',{id:ROLE,accountId:ADMIN,roleId:role.id,companyId:0,processId:0,status:'active'});
    for(const [id,name] of [[C,'Annual extension'],[OTHER,'Other annual extension']] as const)await seed('companies',{id,name,ownerAccountId:ADMIN,status:'Activa'});
    await seed('processes',{id:P,companyId:C,name:'Additional process',processType:'soporte'});await seed('processes',{id:OP,companyId:OTHER,name:'Other process',processType:'soporte'});
    await seed('processCharacterizations',{id:R,processId:P,objective:'Historical characterization'});
    await seed('managementSystems',{id:R,companyId:C,systemName:'Exact system'});
    await seed('managementSystemChecklistItems',{id:R,companyId:C,managementSystemId:R,importKey:'exact',standardName:'Exact standard',verificationMode:'ambas',validFrom:'2026-01-01',validUntil:'2026-12-31'});
    await seed('managementSystemChecklistActions',{id:R,checklistItemId:R,action:'Historical checklist action',completed:1,implementationDate:'2026-11-01'});
    await seed('managementPrograms',{id:R,companyId:C,programName:'Exact program',plannedActions:6,completedActions:4,planFileKey:'uploads/annual-additional/plan.pdf'});
    await seed('programActions',{id:R,companyId:C,programId:R,action:'Exact pending program action',implementationDate:'2026-11-02',completed:0});
    await seed('audits',{id:R,companyId:C,managementSystem:'Exact audit',closuresMajorNC:7});await seed('inspections',{id:R,companyId:C,managementSystem:'Historical inspection'});
    for(const [id,sourceType] of [[R,'audit'],[R+1,'inspection']] as const)await seed('operationalFindings',{id,companyId:C,sourceType,sourceId:R,classification:'major_nc',finding:'Exact historical finding',closureTask:'Historical closure',targetDate:'2026-11-03',completed:sourceType==='audit'?1:0});
    await seed('companyCompliances',{id:R,companyId:C,requirement:'Corporate done stays exact',obligationType:'Legal',completed:'SI',completedMonths:'1,2',evidencePdfKey:'uploads/annual-additional/compliance.pdf'});
    await seed('meetingTypes',{id:R,companyId:C,processId:P,name:'Exact meeting type'});await seed('processMeetings',{id:R,companyId:C,processId:P,meetingTypeId:R,meetingDate:'2026-06-01',objective:'Historical meeting'});
    await seed('meetingAgreements',{id:R,companyId:C,processId:P,meetingId:R,description:'Historical agreement',responsibleType:'other_process',targetProcessId:P,dueDate:'2026-11-04'});
    await seed('changeManagementRecords',{id:R,companyId:C,title:'Historical change',responsibleProcessId:P});await seed('changeManagementActions',{id:R,companyId:C,changeId:R,action:'Historical change action',responsibleProcessId:P,evidenceExpected:'required signed proof'});
    const sourceTypes=['own','checklist_action','checklist_vigency','program_action','company_compliance','audit_finding','inspection_finding','meeting_agreement','change_action','own','own'];
    for(const [i,sourceType] of sourceTypes.entries())await seed('linkedCommitments',{id:R+i,companyId:C,processId:P,sourceType,sourceId:sourceType==='own'?null:sourceType==='inspection_finding'?R+1:R,sourceSubId:sourceType==='own'?null:sourceType==='inspection_finding'?R+1:R,kind:sourceType==='own'?'own':sourceType==='checklist_vigency'?'vigency':'action',title:`Exact commitment ${i}`,dueDate:`2026-11-${String(10+i).padStart(2,'0')}`,status:i%2?'pending':'completed',notes:'Historical notes',completedAt:i%2?null:'2026-09-01'});
    for (const [id,sourceType,sourceSubId] of [[R+30,'checklist_action',R],[R+31,'audit_finding',R]] as const) {
      // Same polymorphic unique key cannot duplicate one process binding; use separate exact sources.
      if(sourceType==='checklist_action') {
        fixtures.managementSystemChecklistActions.push(R+30);
        await seed('managementSystemChecklistActions',{id:R+30,checklistItemId:R,action:'Corporate excluded execution',completed:1});
      } else {
        fixtures.operationalFindings.push(R+31);
        await seed('operationalFindings',{id:R+31,companyId:C,sourceType:'audit',sourceId:R,classification:'observation',finding:'Corporate review finding',closureTask:'Corporate review done',completed:1});
      }
      fixtures.linkedCommitments.push(id);
      await seed('linkedCommitments',{id,companyId:C,processId:P,sourceType,sourceId:id,sourceSubId:sourceType==='audit_finding'?id:sourceSubId,kind:'action',title:`Preserved ${sourceType}`,dueDate:'2026-12-28',status:'completed',notes:'Conserved corporate execution',completedAt:'2026-09-01'});
    }
    for(const [i,id] of [R,R+1,R+2].entries())await seed('linkedCommitmentEvidence',{id,linkedCommitmentId:R+[1,3,6][i],companyId:C,fileName:'historical.pdf',fileKey:`uploads/annual-additional/evidence-${i}.pdf`,fileUrl:'/fixture',mimeType:'application/pdf'});
    await seed('subprocessMaps',{id:R,processId:P,salida:JSON.stringify([{id:'out-exact',sourceOutputKey:'output:exact',salida:'Exact output'}])});
    for(const id of [R,R+1])await seed('processOutputReleaseControls',{id,processId:P,sourceOutputKey:id===R?'output:exact':'output:no-period',outputSnapshot:'Exact output',acceptanceCriteria:'Historical criteria',frequency:'por_evento',isActive:1,configuredByAccountId:ADMIN});
    for(const [i,status] of ['released','pending','exception','released'].entries())await seed('processOutputReleasePeriods',{id:R+i,controlId:R,processId:P,periodKey:`scheduled:2026-12-${10+i}`,scheduledDate:`2026-12-${10+i}`,status,releasedAt:status==='released'?'2026-12-10':null,releasedByAccountId:status==='released'?ADMIN:null,observations:'Old execution'});
    await seed('processOutputReleaseEvidence',{id:R,periodId:R,companyId:C,fileName:'release.pdf',fileKey:'uploads/annual-additional/release.pdf',fileUrl:'/fixture',mimeType:'application/pdf'});
    base=await getWorkspaceForScope(C,2026);workspaces.push(base.id);
    target=await createAnnualWorkspace({companyId:C,year:2027,sourceYear:2026,strategy:{...PRESERVE_STRATEGY},actor:{role:'admin',accountId:ADMIN}});workspaces.push(target.id);
    sourceHash=await digest();
  },60000);
  afterAll(async()=>{
    if(!ledger.size)return;
    await recordControlRows();
    // Exact inserted workspace IDs, verified fixture company; namespace rows and DDL retained, no DROP.
    for(const w of workspaces){for(const table of ['annualHistoricalResolutions','annualFileRetentions','annualEntityLineage','annualProcessStates'])await q(`DELETE FROM ${quoteIdentifier(table)} WHERE ${table==='annualHistoricalResolutions'?'targetWorkspaceId':'workspaceId'}=?`,[w]);await q('DELETE FROM annualWorkspaces WHERE id=? AND companyId=?',[w,C]);}
    const order=['planningCycleOperationalItems','planningCycleSnapshots','planningCycleDecisions','planningCycles','planningCycleActivations','processOutputReleaseEvidence','processOutputReleasePeriods','processOutputReleaseControls','linkedCommitmentEvidence','linkedCommitments','meetingAgreements','processMeetings','meetingTypes','changeManagementActions','changeManagementRecords','programActions','managementPrograms','operationalFindings','audits','inspections','companyCompliances','managementSystemChecklistActions','managementSystemChecklistItems','managementSystems','subprocessMaps','processCharacterizations','processes','companies','account_roles','accounts'];
    for(const table of order){const ids=ledger.get(table);if(ids?.length)await q(`DELETE FROM ${quoteIdentifier(table)} WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);}
  },60000);
  it('prepares exact done+pending candidates and extends existing draft without inherited approval or payload rewrite',async()=>{
    const caller=app.createCaller(ctx()).planningCycles;
    const result=await caller.prepareDraft({companyId:C,processId:P,targetYear:2027});await recordControlRows();
    const decisions=await q('SELECT * FROM planningCycleDecisions WHERE targetCycleId=? ORDER BY id',[result.cycleId]);
    expect(decisions.filter((d:any)=>d.itemType==='linked_commitment')).toHaveLength(13);expect(decisions.filter((d:any)=>d.itemType==='output_release')).toHaveLength(4);
    expect(new Set(decisions.filter((d:any)=>d.itemType==='linked_commitment').map((d:any)=>Number(d.completionPercent)))).toEqual(new Set([0,100]));
    const [old]=decisions;await q("UPDATE planningCycleDecisions SET decision='review',decisionNote='keep exact prior' WHERE id=?",[old.id]);
    await q("UPDATE planningCycles SET status='ready',managerApprovalStatus='approved',managerReviewedAt=CURRENT_TIMESTAMP WHERE id=?",[result.cycleId]);
    // A new real source item appears; explicit prepare adds only this one.
    const extra=R+20;fixtures.linkedCommitments.push(extra);await seed('linkedCommitments',{id:extra,companyId:C,processId:P,sourceType:'own',kind:'own',title:'New after prior approval',dueDate:'2026-12-30'});
    const refreshed=await caller.prepareDraft({companyId:C,processId:P,targetYear:2027});await recordControlRows();expect(refreshed.itemCount).toBe(1);
    const [cycle]=await q('SELECT status,managerApprovalStatus FROM planningCycles WHERE id=?',[result.cycleId]);expect(cycle).toEqual({status:'in_review',managerApprovalStatus:'pending'});
    const [prior]=await q('SELECT * FROM planningCycleDecisions WHERE id=?',[old.id]);expect(prior.sourcePayloadJson).toBe(old.sourcePayloadJson);expect(prior.decision).toBe('review');expect(prior.decisionNote).toBe('keep exact prior');
    expect((await caller.prepareDraft({companyId:C,processId:P,targetYear:2027})).itemCount).toBe(0);
    sourceHash=await digest();
  });
  it('rejects stale definitions/evidence and rolls back every destination change on collision',async()=>{
    const [cycle]=await q('SELECT * FROM planningCycles WHERE companyId=? AND processId=? AND cycleYear=2027',[C,P]);
    const decisions=await q('SELECT * FROM planningCycleDecisions WHERE targetCycleId=? ORDER BY id',[cycle.id]);
    for(const d of decisions){const nav=JSON.parse(d.sourcePayloadJson).activity.navigation;const selected=d.itemType==='linked_commitment'?![R+9,R+10,R+20,R+30,R+31].includes(nav.commitmentId):[R,R+1].includes(nav.periodId);await q('UPDATE planningCycleDecisions SET decision=?,decidedAt=NULL WHERE id=?',[selected?'migrate':nav.commitmentId===R+10||nav.commitmentId===R+31||nav.periodId===R+3?'review':'close',d.id]);}
    await q("UPDATE planningCycles SET status='ready',managerApprovalStatus='approved',managerReviewedAt=CURRENT_TIMESTAMP WHERE id=?",[cycle.id]);
    const before=await targetDigest();
    const [control]=await q('SELECT acceptanceCriteria,updatedAt FROM processOutputReleaseControls WHERE id=?',[R]);
    await q('UPDATE processOutputReleaseControls SET acceptanceCriteria=?,updatedAt=? WHERE id=?',['Changed hidden definition',control.updatedAt,R]);
    try{await expect(incorporateApprovedProcess({companyId:C,year:2027,processId:P,actor:{role:'admin'}})).rejects.toThrow(/cambió.*snapshot/);expect(await targetDigest()).toBe(before);}finally{await q('UPDATE processOutputReleaseControls SET acceptanceCriteria=?,updatedAt=? WHERE id=?',[control.acceptanceCriteria,control.updatedAt,R]);}
    const [evidence]=await q('SELECT fileKey FROM linkedCommitmentEvidence WHERE id=?',[R+1]);
    await q('UPDATE linkedCommitmentEvidence SET fileKey=? WHERE id=?',['uploads/annual-additional/changed-proof.pdf',R+1]);
    try{await expect(incorporateApprovedProcess({companyId:C,year:2027,processId:P,actor:{role:'admin'}})).rejects.toThrow(/cambió.*snapshot/);expect(await targetDigest()).toBe(before);}finally{await q('UPDATE linkedCommitmentEvidence SET fileKey=? WHERE id=?',[evidence.fileKey,R+1]);}
    await q(`INSERT INTO ${t('processOutputReleasePeriods')}(id,controlId,processId,periodKey,scheduledDate) VALUES(?,?,?,'collision','2027-01-01')`,[R,R,P]);
    const collisionBefore=await targetDigest();
    try{await expect(incorporateApprovedProcess({companyId:C,year:2027,processId:P,actor:{role:'admin'}})).rejects.toThrow(/Colisión/);expect(await targetDigest()).toBe(collisionBefore);expect(await getProcessWorkspaceStatus(target.id,P)).toBe('pending');}finally{await q(`DELETE FROM ${t('processOutputReleasePeriods')} WHERE id=?`,[R]);}
    expect(await digest()).toBe(sourceHash);
  });
  it('migrates selected exact IDs only, preserving corporate facts and keeping program/inspection execution empty',async()=>{
    expect(await incorporateApprovedProcess({companyId:C,year:2027,processId:P,actor:{role:'admin'}})).toEqual({alreadyIncorporated:false});
    const rows=await q(`SELECT * FROM ${t('linkedCommitments')} ORDER BY id`);expect(rows.map((r:any)=>r.id)).toEqual([...Array.from({length:9},(_,i)=>R+i),R+30,R+31]);
    for(const id of [R+30,R+31])expect(await q(`SELECT * FROM ${t('linkedCommitments')} WHERE id=?`,[id])).toEqual(await q('SELECT * FROM linkedCommitments WHERE id=?',[id]));
    for(const row of rows.filter((r:any)=>r.id<R+30)){expect(row.status).toBe('pending');expect(row.completedAt).toBeNull();expect(row.notes).toBeNull();expect(row.dueDate.getUTCFullYear()).toBe(2027);expect(row.sourceWorkspaceId).toBe(row.sourceType==='own'?null:base.id);}
    expect(await q(`SELECT * FROM ${t('linkedCommitmentEvidence')}`)).toEqual([]);
    expect((await q(`SELECT id FROM ${t('processOutputReleaseControls')} ORDER BY id`)).map((r:any)=>r.id)).toEqual([R,R+1]);
    const periods=await q(`SELECT * FROM ${t('processOutputReleasePeriods')} ORDER BY id`);expect(periods.map((r:any)=>r.id)).toEqual([R,R+1]);
    for(const row of periods){expect(row.status).toBe('pending');expect(row.releasedAt).toBeNull();expect(row.releasedByAccountId).toBeNull();expect(row.observations).toBeNull();expect(row.scheduledDate.getUTCFullYear()).toBe(2027);}
    for(const table of ['programActions','inspections','processMeetings','meetingAgreements','changeManagementRecords','changeManagementActions','processOutputReleaseEvidence'])expect(await q(`SELECT * FROM ${t(table)}`)).toEqual([]);
    for(const table of ['audits','companyCompliances','managementSystemChecklistItems','managementSystemChecklistActions'])expect(await q(`SELECT * FROM ${t(table)} WHERE id=?`,[R])).toEqual(await q(`SELECT * FROM ${quoteIdentifier(table)} WHERE id=?`,[R]));
    expect((await q(`SELECT plannedActions,completedActions FROM ${t('managementPrograms')} WHERE id=?`,[R]))[0]).toEqual({plannedActions:0,completedActions:0});
    const [lineage]=await q("SELECT referenceJson FROM annualEntityLineage WHERE workspaceId=? AND tableName='linkedCommitments' AND entityId=?",[target.id,R+3]);expect(JSON.parse(lineage.referenceJson).sourceEvidence).toHaveLength(1);
    expect(await incorporateApprovedProcess({companyId:C,year:2027,processId:P,actor:{role:'admin'}})).toEqual({alreadyIncorporated:true});expect(await digest()).toBe(sourceHash);
    expect((await app.createCaller(ctx()).planningCycles.prepareDraft({companyId:C,processId:P,targetYear:2027})).itemCount).toBe(0);expect((await getWorkspaceForScope(C,2026)).status).toBe('open');
  });
  it('completes destination commitments/releases through real routers without modifying historical parents/results',async()=>{
    const closed=await closeAnnualWorkspace({companyId:C,year:2026,actor:{role:'admin'}});
    expect(closed.status).toBe('closed');
    expect(await digest()).toBe(sourceHash);
    const caller=app.createCaller(ctx(2027));
    for(const id of [R,R+1,R+3,R+4,R+5,R+6,R+7])await caller.linkedCommitments.updateProgress({id,companyId:C,status:'completed'});
    await caller.linkedCommitments.updateProgress({id:R+2,companyId:C,status:'completed',renewedValidFrom:'2027-01-01',renewedValidUntil:'2027-12-31'});
    await expect(caller.linkedCommitments.updateProgress({id:R+8,companyId:C,status:'completed'})).rejects.toThrow(/requiere evidencia/);
    await caller.processOutputRelease.updatePeriod({periodId:R,status:'released',observations:'New execution only'});
    expect((await q(`SELECT status FROM ${t('processOutputReleasePeriods')} WHERE id=?`,[R]))[0].status).toBe('released');expect(await digest()).toBe(sourceHash);
    for(const table of ['audits','companyCompliances','managementSystemChecklistItems','managementSystemChecklistActions'])expect(await q(`SELECT * FROM ${t(table)} WHERE id=?`,[R])).toEqual(await q(`SELECT * FROM ${quoteIdentifier(table)} WHERE id=?`,[R]));
    await expect(incorporateApprovedProcess({companyId:C,year:2027,processId:OP,actor:{role:'admin'}})).rejects.toThrow(/pertenece/);
  });
  it('does not duplicate migrated program/inspection commitments as historical pending items',async()=>{
    const result=await listAnnualHistory({companyId:C,year:2027,processId:P},ctx(2027));
    expect(result.items.some(i=>i.sourceTable==='linkedCommitments'&&[R+3,R+6].includes(i.sourceId))).toBe(false);
    expect(await digest()).toBe(sourceHash);
  });
});
