import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createPool } from 'mysql2/promise';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { annualWorkspaces, annualProcessStates, annualEntityLineage, annualFileRetentions } from '../../drizzle/schema';
import { namespaceTable, quoteIdentifier } from '../annual/manifest';
import { getDatabasePool } from '../db';
import { getWorkspaceForScope, createAnnualWorkspace, incorporateApprovedProcess, closeAnnualWorkspace, getAnnualOverview, isFileRetained, listRetainedFiles, listHistoricalPendings, PRESERVE_STRATEGY, getProcessWorkspaceStatus } from '../annual/store';
import { annualHash } from '../annual/migration';
import { runInAnnualScope } from '../annual/runtime';
import { getConsolidatedScheduleActivities } from '../lib/consolidatedScheduleActivities';
import { assertAnnualIntegrationDatabase } from './helpers/annualTestSafety';

// Refuse BEFORE connecting. Never use review/source/production, even to discover data.
assertAnnualIntegrationDatabase();
const suite = describe;
// Exclusive core source block, below the TEST's existing AUTO_INCREMENT high-water
// marks. Explicit seeds must not pull unrelated suites into our digest/cleanup.
const C=998710001, OTHER=998710002, P=998710011, P2=998710012, EMPTY=998710013, ROW=998710201;
const actor={role:'admin',accountId:998710021};
const sourceTables=['companyInfo','policies','policyObjectives','strategicObjectives','strategicObjectiveMeasurementConfigs','strategicObjectiveMeasurements','processCharacterizations','processParticipants','participantWorkerAssignments','payrollEmployees','audits','operationalFindings','linkedCommitments','linkedCommitmentEvidence','companyCompliances','companyTrainings','trainingBackups','managementPrograms','programActions','programActionBaselines','inspections','processTacticalObjectives','processFODA','stakeholders','criticalityMatrix','documents'];
const fixtureIds:Record<string,number[]>={accounts:[actor.accountId],companies:[C,OTHER],processes:[P,P2,EMPTY],...Object.fromEntries(sourceTables.map(t=>[t,[ROW]]))};
const createdRows=new Map<string,number[]>();
const createdWorkspaceIds:number[]=[];
let base:any,target:any;
let beforeHash='';
let pool:ReturnType<typeof createPool>;
const q=async(sql:string,args:any[]=[])=> { const [rows]=await pool.query(sql,args);return rows as any; };
async function seed(table:string,sql:string,args:any[],ids=fixtureIds[table]) {
  const result=await q(sql,args);
  createdRows.set(table,[...(createdRows.get(table)??[]),...ids]);
  return result;
}
async function sourceDigest() {
  const snapshots=[];
  // Preserve every original 2026 fixture byte, including permanent identities.
  // A broad numeric interval also includes other suites' AUTO_INCREMENT rows.
  for (const [table,ids] of Object.entries(fixtureIds)) snapshots.push([table,await q(`SELECT * FROM ${quoteIdentifier(table)} WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id`,ids)]);
  return annualHash(snapshots);
}
async function reserveBaseWorkspace() {
  // Base snapshot definitions remain additive. A rerun never reuses an aw_* ID.
  const rows=await q('SELECT id FROM annualWorkspaces WHERE id BETWEEN ? AND ?',[998711000,998719999]);
  const names=await q("SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'aw_99871%'");
  const used=[...rows.map((r:any)=>Number(r.id)),...names.map((r:any)=>Number(/^aw_(\d+)_/.exec(r.name)?.[1]??0)).filter((id:number)=>id>=998711000&&id<=998719999)];
  const id=Math.max(998710999,...used)+1;
  if (id>998719999) throw new Error('Exclusive core base namespace block exhausted; do not reuse');
  await q("INSERT INTO annualWorkspaces(id,companyId,year,status,storage,strategyJson) VALUES(?,?,2026,'open','base',?)",[id,C,JSON.stringify(PRESERVE_STRATEGY)]);
  createdWorkspaceIds.push(id);
  // Store allocates future workspace IDs through canonical AUTO_INCREMENT.
  // Reserve above every retained namespace, including metadata already cleaned
  // by earlier QA. Never reuse tables, and never lower the existing counter.
  const allNames=await q("SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'aw_%'");
  const maxNamespace=Math.max(0,...allNames.map((r:any)=>Number(/^aw_(\d+)_/.exec(r.name)?.[1]??0)));
  const [metadata]=await q('SELECT MAX(id) maxId FROM annualWorkspaces');
  // INFORMATION_SCHEMA.AUTO_INCREMENT may be cached after DELETE/INSERT; SHOW
  // CREATE reads the current definition rather than a stale statistics value.
  const [definition]=await q('SHOW CREATE TABLE annualWorkspaces');
  const current=Number(/\bAUTO_INCREMENT=(\d+)/.exec(definition['Create Table'])?.[1]??1);
  const next=Math.max(maxNamespace+1,Number(metadata.maxId??0)+1,current);
  if (!Number.isSafeInteger(next) || next>2147483647) throw new Error('Core workspace namespace range exhausted');
  await q(`ALTER TABLE annualWorkspaces AUTO_INCREMENT=${next}`);
}
async function createMetadataOnly() {
  // Generate the exact four additive definitions from Drizzle. No db:push.
  for (const t of [annualWorkspaces,annualProcessStates,annualEntityLineage,annualFileRetentions]) {
    const cfg=getTableConfig(t);
    const cols=cfg.columns.map(c=> {
      let sql=quoteIdentifier(c.name)+' '+c.getSQLType();
      if (c.notNull) sql+=' NOT NULL';
      if (c.primary) sql+=' PRIMARY KEY';
      if ('autoIncrement' in c && c.autoIncrement) sql+=' AUTO_INCREMENT';
      if (c.hasDefault) {
        if (c.name==='createdAt' || c.name==='updatedAt') sql+=' DEFAULT CURRENT_TIMESTAMP';
        else if (typeof c.default==='number') sql+=' DEFAULT '+c.default;
        else if (typeof c.default==='string') sql+=" DEFAULT '"+c.default+"'";
      }
      return sql;
    });
    for (const u of cfg.uniqueConstraints) cols.push(`CONSTRAINT ${quoteIdentifier(u.name!)} UNIQUE (${u.columns.map(c=>quoteIdentifier(c.name)).join(',')})`);
    await q(`CREATE TABLE IF NOT EXISTS ${quoteIdentifier(cfg.name)} (${cols.join(',')}) ENGINE=InnoDB`);
  }
}
suite('annual core MySQL isolation (TEST localhost:3307 only)',()=> {
  beforeAll(async()=> {
    assertAnnualIntegrationDatabase();
    pool=getDatabasePool();
    await createMetadataOnly();
    for (const [table,ids] of Object.entries({...fixtureIds,planningCycles:[ROW,ROW+100]})) {
      const existing=await q(`SELECT id FROM ${quoteIdentifier(table)} WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);
      if (existing.length) throw new Error(`Core fixtures already exist in ${table}: do not overwrite`);
    }
    const workspaces=await q('SELECT id FROM annualWorkspaces WHERE companyId IN (?,?)',[C,OTHER]);
    if (workspaces.length) throw new Error('Core fixture company workspaces already exist; do not overwrite');
    const decisions=await q('SELECT id FROM planningCycleDecisions WHERE targetCycleId IN (?,?)',[ROW,ROW+100]);
    if (decisions.length) throw new Error('Core fixture planning decisions already exist; do not overwrite');
    await reserveBaseWorkspace();
    await seed('accounts','INSERT INTO accounts(id,openId,name,email,status) VALUES(?,?,?,?,?)',[actor.accountId,`annual-core-fixture-${actor.accountId}`,'Annual core 998710 fixture','annual-core-998710@example.invalid','active']);
    await seed('companies',"INSERT INTO companies(id,name,ownerAccountId,status) VALUES(?,?,?,'Activa'),(?,?,?,'Activa')",[C,'Annual fixture',actor.accountId,OTHER,'Annual other fixture',actor.accountId]);
    await seed('processes',"INSERT INTO processes(id,companyId,name,processType) VALUES(?,?,?,'soporte'),(?,?,?,'soporte'),(?,?,?,'soporte')",[P,C,'Annual process',P2,OTHER,'Annual other process',EMPTY,C,'Annual empty process']);
    await seed('companyInfo','INSERT INTO companyInfo(id,companyId,proposito,mision,vision) VALUES(?,?,?,?,?)',[ROW,C,'Purpose','Mission','Vision']);
    await seed('policies',"INSERT INTO policies(id,companyId,versionNo,policyText) VALUES(?,?,?,?)",[ROW,C,'v2026','Policy']);
    await seed('policyObjectives','INSERT INTO policyObjectives(id,policyId,objective,orderIndex) VALUES(?,?,?,0)',[ROW,ROW,'Policy objective']);
    await seed('strategicObjectives','INSERT INTO strategicObjectives(id,companyId,objective,startYear,endYear,orderIndex) VALUES(?,?,?,2026,2030,0)',[ROW,C,'Exact OE']);
    await seed('strategicObjectiveMeasurementConfigs','INSERT INTO strategicObjectiveMeasurementConfigs(id,companyId,objectiveId,initialSituation,expectedResult,indicator,unit,deadline) VALUES(?,?,?,?,?,?,?,?)',[ROW,C,ROW,'Initial','Expected','Measure','unit','2026-12-01']);
    await seed('strategicObjectiveMeasurements','INSERT INTO strategicObjectiveMeasurements(id,companyId,objectiveId,measurementDate,value,observation,evidence,percent) VALUES(?,?,?,?,?,?,?,?)',[ROW,C,ROW,'2026-11-01',9,'Old observation','Old ref',90]);
    await seed('processCharacterizations','INSERT INTO processCharacterizations(id,processId,responsible,objective,payrollArea) VALUES(?,?,?,?,?)',[ROW,P,'Responsible','Characterization2026','OrgArea']);
    await seed('processParticipants','INSERT INTO processParticipants(id,processCharacterizationId,position,orderIndex) VALUES(?,?,?,0)',[ROW,ROW,'Stable position']);
    await seed('payrollEmployees','INSERT INTO payrollEmployees(id,companyId,fullName,identityCard,area,position,hireDate) VALUES(?,?,?,?,?,?,\'2026-01-01\')',[ROW,C,'Fixture person','annual-fixture-ci','OrgArea','Contract position']);
    await seed('participantWorkerAssignments','INSERT INTO participantWorkerAssignments(id,processParticipantId,payrollEmployeeId) VALUES(?,?,?)',[ROW,ROW,ROW]);
    await seed('audits','INSERT INTO audits(id,companyId,managementSystem,auditDate,closuresMajorNC) VALUES(?,?,?,?,?)',[ROW,C,'System','2026-04-01',2]);
    await seed('operationalFindings',"INSERT INTO operationalFindings(id,companyId,sourceType,sourceId,classification,finding,closureTask,completed) VALUES(?,?,'audit',?,'major_nc',?,?,1)",[ROW,C,ROW,'Historical finding','Historical closure']);
    await seed('linkedCommitments',"INSERT INTO linkedCommitments(id,companyId,processId,sourceType,sourceId,sourceSubId,kind,title,status) VALUES(?,?,?,'audit_finding',?,?,'action',?,'completed')",[ROW,C,P,ROW,ROW,'Historical audit binding']);
    await seed('linkedCommitmentEvidence','INSERT INTO linkedCommitmentEvidence(id,linkedCommitmentId,companyId,fileName,fileKey,fileUrl,mimeType) VALUES(?,?,?,?,?,?,\'application/pdf\')',[ROW,ROW,C,'fixture.pdf','uploads/annual-test/shared.pdf','/fixture']);
    await seed('companyCompliances',"INSERT INTO companyCompliances(id,companyId,requirement,obligationType,completed,completedMonths,evidencePdfKey) VALUES(?,?,?,'Legal','SI','1,2',?)",[ROW,C,'All corporate compliance','uploads/annual-test/compliance.pdf']);
    await seed('companyTrainings',"INSERT INTO companyTrainings(id,companyId,name,type,modality,conductedDate,actualAttendees,completed) VALUES(?,?,?,'Mandatoria','Presencial','2026-02-01',27,'SI')",[ROW,C,'Historical corporate training']);
    await seed('trainingBackups','INSERT INTO trainingBackups(id,trainingId,companyId,fileName,fileKey,fileUrl) VALUES(?,?,?,?,?,?)',[ROW,ROW,C,'training.pdf','uploads/annual-test/training.pdf','/fixture']);
    await seed('managementPrograms','INSERT INTO managementPrograms(id,companyId,programName,managementSystem,plannedActions,completedActions,planFileKey) VALUES(?,?,?,?,?,?,?)',[ROW,C,'Preserved program','System',5,4,'uploads/annual-test/plan.pdf']);
    await seed('programActions','INSERT INTO programActions(id,programId,companyId,action,completed) VALUES(?,?,?,?,0)',[ROW,ROW,C,'Origin pending program']);
    await seed('programActionBaselines','INSERT INTO programActionBaselines(id,companyId,programId,legacyPlannedActions,legacyCompletedActions) VALUES(?,?,?,?,?)',[ROW,C,ROW,5,4]);
    await seed('inspections','INSERT INTO inspections(id,companyId,managementSystem) VALUES(?,?,?)',[ROW,C,'Historical inspection']);
    await seed('documents','INSERT INTO documents(id,processId,documentName,documentType,status,fileKey) VALUES(?,?,?,\'Varios\',\'Vigente\',?)',[ROW,P,'Mapa de Procesos - Imagen','uploads/annual-test/map.png']);
    const plan={resultKeys:[{id:'oo-a',description:'OO',tasks:[{id:'task-migrate',description:'Migrate this exact task',date:'2027-01-10',percentageCompleted:40},{id:'task-close',description:'Do not migrate task',date:'2027-01-11',percentageCompleted:100}]}]};
    await seed('processTacticalObjectives',"INSERT INTO processTacticalObjectives(id,processId,name,policyObjectiveId,strategicObjective,planningData,completed) VALUES(?,?,?,?,?,?,'SI')",[ROW,P,'OTE',ROW,'Exact OE',JSON.stringify(plan)]);
    await seed('processFODA','INSERT INTO processFODA(id,processId,strengths,matrixData) VALUES(?,?,?,?)',[ROW,P,'[]',JSON.stringify([{id:'otg-migrate',elemento:'A',accionATomar:'Migrate exact OTG',fechaFinalPrevista:'2027-01-15',objetivoLogrado:'SI'},{id:'otg-close',elemento:'B',accionATomar:'Close OTG',fechaFinalPrevista:'2027-01-16',objetivoLogrado:'SI'}])]);
    await seed('stakeholders',"INSERT INTO stakeholders(id,processId,name,type,isInternal,orderIndex) VALUES(?,?,?,'cliente',0,0)",[ROW,P,'Stakeholder']);
    await seed('criticalityMatrix',"INSERT INTO criticalityMatrix(id,processId,stakeholderId,incidence,risk,criticality,actionToTake,endDate,implementationStatus,completionPercentage) VALUES(?,?,?,'1','A','Low',?,'2027-01-20',1,100)",[ROW,P,ROW,'Migrate exact GPI']);
    base=await getWorkspaceForScope(C,2026);
    beforeHash=await sourceDigest();
  },60000);
  afterAll(async()=> {
    if (!pool) return;
    // No cleanup on a failed ownership claim. Only successful inserts above,
    // and metadata for the fixture company whose prior absence was verified.
    if (!createdWorkspaceIds.length && !createdRows.size) return;
    const workspaces=await q('SELECT id FROM annualWorkspaces WHERE companyId=?',[C]);
    const workspaceIds=workspaces.map((w:any)=>Number(w.id));
    if (workspaceIds.length) {
      const placeholders=workspaceIds.map(()=>'?').join(',');
      for (const table of ['annualFileRetentions','annualEntityLineage','annualProcessStates']) await q(`DELETE FROM ${quoteIdentifier(table)} WHERE workspaceId IN (${placeholders})`,workspaceIds);
      await q(`DELETE FROM annualWorkspaces WHERE id IN (${placeholders}) AND companyId=?`,[...workspaceIds,C]);
    }
    // FK order and exact IDs only; never delete a whole high-ID interval.
    for (const table of ['planningCycleDecisions','planningCycles','strategicObjectiveMeasurements','strategicObjectiveMeasurementConfigs','participantWorkerAssignments','processParticipants','linkedCommitmentEvidence','linkedCommitments','trainingBackups','programActionBaselines','programActions','documents','criticalityMatrix','stakeholders','processFODA','processTacticalObjectives','processCharacterizations','policyObjectives','policies','strategicObjectives','companyInfo','operationalFindings','audits','companyCompliances','companyTrainings','managementPrograms','inspections','payrollEmployees','processes','companies','accounts']) {
      const ids=createdRows.get(table);
      if (ids?.length) await q(`DELETE FROM ${quoteIdentifier(table)} WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);
    }
    // Canonical pool is shared with other TEST fixtures; this suite does not own it.
    // Namespace definitions/rows remain additive evidence, never DROP/reuse.
  },60000);
  it('GET missing year does not create it',async()=> {
    expect(await sourceDigest()).toBe(beforeHash);
    await expect(getWorkspaceForScope(C,2027)).rejects.toThrow(/no existe/);
    expect(await q('SELECT id FROM annualWorkspaces WHERE companyId=? AND year=2027',[C])).toHaveLength(0);
  });
  it('creates namespace atomically, exact preservation, excluded identity and empty execution tables',async()=> {
    target=await createAnnualWorkspace({companyId:C,year:2027,sourceYear:2026,strategy:{...PRESERVE_STRATEGY},actor});
    expect((await getWorkspaceForScope(C,2026)).storage).toBe('base');expect((await getWorkspaceForScope(C,2026)).status).toBe('open');
    const t=(name:string)=>quoteIdentifier(namespaceTable(target.id,name));
    for (const name of ['audits','companyCompliances','companyTrainings','trainingBackups','linkedCommitments','linkedCommitmentEvidence']) expect(await q(`SELECT * FROM ${t(name)} WHERE id=?`,[ROW])).toEqual(await q(`SELECT * FROM ${quoteIdentifier(name)} WHERE id=?`,[ROW]));
    for (const name of ['programActions','inspections','inspectionFiles','strategicObjectiveMeasurements','participantWorkerKpiValues','processTacticalObjectives']) expect(await q(`SELECT * FROM ${t(name)}`)).toEqual([]);
    expect(await q(`SELECT id FROM ${t('processes')} WHERE companyId=?`,[OTHER])).toHaveLength(0);
    expect((await q(`SELECT plannedActions,completedActions,planFileKey FROM ${t('managementPrograms')}`))[0]).toEqual({plannedActions:0,completedActions:0,planFileKey:'uploads/annual-test/plan.pdf'});
    expect(await sourceDigest()).toBe(beforeHash);
    const [meta]=await q('SELECT AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[namespaceTable(target.id,'processTacticalObjectives')]);
    const [max]=await q('SELECT MAX(id) maxId FROM processTacticalObjectives');expect(Number(meta.AUTO_INCREMENT)).toBeGreaterThan(Number(max.maxId));
    expect(await q('SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_TYPE=\'FOREIGN KEY\'',[namespaceTable(target.id,'processParticipants')])).toEqual([]);
  });
  it('records real training lineage without guessing plannedDate and retains all origin/destination keys',async()=> {
    const overview=await getAnnualOverview(C,2027);
    expect(overview.trainingOrigins[ROW]).toBe(2026);expect(overview.incorporatedCount).toBe(0);
    expect(await isFileRetained('annual-test/shared.pdf')).toBe(true);
    expect(await isFileRetained('uploads/annual-test/plan.pdf')).toBe(true);
    expect((await listRetainedFiles(base.id)).some(r=>r.fileKey==='uploads/annual-test/map.png')).toBe(true);
    const pendings=await listHistoricalPendings(C,2027);expect(pendings.sourceYear).toBe(2026);expect(pendings.programActions).toHaveLength(1);
  });
  it('creation is idempotent and rejects changed options without source changes',async()=> {
    expect((await createAnnualWorkspace({companyId:C,year:2027,sourceYear:2026,strategy:{...PRESERVE_STRATEGY},actor})).id).toBe(target.id);
    await expect(createAnnualWorkspace({companyId:C,year:2027,sourceYear:2026,strategy:{...PRESERVE_STRATEGY,policy:false},actor})).rejects.toThrow(/distintas/);
    expect(await sourceDigest()).toBe(beforeHash);
  });
  it('requires actual ready+approved cycle then selects exact OTE task, OTG row and GPI with reset',async()=> {
    await expect(incorporateApprovedProcess({companyId:C,year:2027,processId:P,actor})).rejects.toThrow(/ready/);
    await seed('planningCycles',"INSERT INTO planningCycles(id,companyId,processId,cycleYear,status,managerApprovalStatus,managerReviewedAt) VALUES(?,?,?,2027,'ready','approved',CURRENT_TIMESTAMP)",[ROW,C,P],[ROW]);
    const activities=await runInAnnualScope(base,()=>getConsolidatedScheduleActivities(P));
    for (const [i,a] of activities.entries()) {
      if (!['objective','foda','stakeholder','compliance'].includes(a.type)) continue;
      const type={objective:'ote',foda:'otg',stakeholder:'stakeholder_action',compliance:'compliance'}[a.type as 'objective'];
      const migrate=!a.action.includes('Do not') && !a.action.includes('Close');
      await seed('planningCycleDecisions','INSERT INTO planningCycleDecisions(id,targetCycleId,itemType,sourceItemKey,title,sourcePayloadJson,decision) VALUES(?,?,?,?,?,?,?)',[ROW+i,ROW,type,`schedule:${a.id}`,a.action,JSON.stringify({source:'consolidated_schedule',activity:a}),migrate?'migrate':'close'],[ROW+i]);
    }
    // Occupied local ID from a destination edit must never be ignored or overwritten.
    const oteTable=quoteIdentifier(namespaceTable(target.id,'processTacticalObjectives'));
    await q(`INSERT INTO ${oteTable}(id,processId,name) VALUES(?,?,?)`,[ROW,P,'Destination collision']);
    await expect(incorporateApprovedProcess({companyId:C,year:2027,processId:P,actor})).rejects.toThrow(/Colisión/);
    expect(await getProcessWorkspaceStatus(target.id,P)).toBe('pending');
    expect((await q(`SELECT objective FROM ${quoteIdentifier(namespaceTable(target.id,'processCharacterizations'))} WHERE id=?`,[ROW]))[0].objective).toBe('');
    expect(await q(`SELECT * FROM ${quoteIdentifier(namespaceTable(target.id,'subprocessMaps'))}`)).toEqual([]);
    expect((await q(`SELECT name FROM ${oteTable} WHERE id=?`,[ROW]))[0].name).toBe('Destination collision');
    await q(`DELETE FROM ${oteTable} WHERE id=?`,[ROW]);
    // The source is a synthetic fixture in isolated TEST only. Changing a real
    // snapshot identity/description must force review; restoring fixture bytes
    // is test cleanup, not a migration write to any review/business source.
    const [sourceBefore]=await q('SELECT planningData,updatedAt FROM processTacticalObjectives WHERE id=?',[ROW]);
    const changed=JSON.parse(sourceBefore.planningData);changed.resultKeys[0].tasks[0].description='Changed since approval';
    await q('UPDATE processTacticalObjectives SET planningData=?,updatedAt=? WHERE id=?',[JSON.stringify(changed),sourceBefore.updatedAt,ROW]);
    try {
      await expect(incorporateApprovedProcess({companyId:C,year:2027,processId:P,actor})).rejects.toThrow(/snapshot aprobado/);
      expect(await getProcessWorkspaceStatus(target.id,P)).toBe('pending');
    } finally {
      await q('UPDATE processTacticalObjectives SET planningData=?,updatedAt=? WHERE id=?',[sourceBefore.planningData,sourceBefore.updatedAt,ROW]);
    }
    expect(await incorporateApprovedProcess({companyId:C,year:2027,processId:P,actor})).toEqual({alreadyIncorporated:false});
    const [ote]=await q(`SELECT * FROM ${quoteIdentifier(namespaceTable(target.id,'processTacticalObjectives'))}`);
    const plan=JSON.parse(ote.planningData);expect(plan.resultKeys).toHaveLength(1);expect(plan.resultKeys[0].tasks).toHaveLength(1);expect(plan.resultKeys[0].tasks[0]).toMatchObject({id:'task-migrate',percentageCompleted:0});
    const [foda]=await q(`SELECT * FROM ${quoteIdentifier(namespaceTable(target.id,'processFODA'))}`);expect(JSON.parse(foda.matrixData).map((r:any)=>r.id)).toEqual(['otg-migrate']);
    const [gpi]=await q(`SELECT * FROM ${quoteIdentifier(namespaceTable(target.id,'criticalityMatrix'))}`);expect(gpi.implementationStatus).toBe(0);expect(gpi.completionPercentage).toBe(0);
    expect(await incorporateApprovedProcess({companyId:C,year:2027,processId:P,actor})).toEqual({alreadyIncorporated:true});
    expect(await sourceDigest()).toBe(beforeHash);
  });
  it('permits empty approved structure, but rejects cross-company processes',async()=> {
    await seed('planningCycles',"INSERT INTO planningCycles(id,companyId,processId,cycleYear,status,managerApprovalStatus,managerReviewedAt) VALUES(?,?,?,2027,'ready','approved',CURRENT_TIMESTAMP)",[ROW+100,C,EMPTY],[ROW+100]);
    expect(await incorporateApprovedProcess({companyId:C,year:2027,processId:EMPTY,actor})).toEqual({alreadyIncorporated:false});
    await expect(incorporateApprovedProcess({companyId:C,year:2027,processId:P2,actor})).rejects.toThrow(/pertenece/);
    expect(await getProcessWorkspaceStatus(target.id,P)).toBe('incorporated');
  });
  it('failed preparation remains private, rolls back all rows and does not silently retry',async()=> {
    const table=quoteIdentifier(namespaceTable(target.id,'linkedCommitments'));
    await q(`INSERT INTO ${table}(id,companyId,processId,sourceType,sourceId,sourceSubId,kind,title,status) VALUES(?,?,?,'audit_finding',?,?,'action','Invalid dependency fixture','pending')`,[ROW+200,C,P,ROW+201,ROW+201]);
    await expect(createAnnualWorkspace({companyId:C,year:2028,sourceYear:2027,strategy:{...PRESERVE_STRATEGY},actor})).rejects.toThrow(/operationalFindings/);
    const [preparing]=await q('SELECT id,status FROM annualWorkspaces WHERE companyId=? AND year=2028',[C]);
    expect(preparing.status).toBe('preparing');
    expect(await q(`SELECT * FROM ${quoteIdentifier(namespaceTable(preparing.id,'companyInfo'))}`)).toEqual([]);
    expect(await q('SELECT id FROM annualEntityLineage WHERE workspaceId=?',[preparing.id])).toEqual([]);
    expect(await q('SELECT id FROM annualFileRetentions WHERE workspaceId=?',[preparing.id])).toEqual([]);
    await expect(getWorkspaceForScope(C,2028)).rejects.toThrow(/preparado/);
    await expect(createAnnualWorkspace({companyId:C,year:2028,sourceYear:2027,strategy:{...PRESERVE_STRATEGY},actor})).rejects.toThrow(/incompleta/);
    await q(`DELETE FROM ${table} WHERE id=?`,[ROW+200]);
    expect(await sourceDigest()).toBe(beforeHash);
  });
  it('close snapshots 2026 and modifies metadata only; destination mutations do not affect originals',async()=> {
    await q(`UPDATE ${quoteIdentifier(namespaceTable(target.id,'companyInfo'))} SET proposito='Destination only' WHERE companyId=?`,[C]);
    expect(await sourceDigest()).toBe(beforeHash);
    const closed=await closeAnnualWorkspace({companyId:C,year:2026,actor});expect(closed.status).toBe('closed');expect(closed.storage).toBe('namespace');
    expect(await sourceDigest()).toBe(beforeHash);
    expect(await q(`SELECT proposito FROM ${quoteIdentifier(namespaceTable(base.id,'companyInfo'))}`)).toEqual([{proposito:'Purpose'}]);
    expect(await q('SELECT id FROM accounts WHERE id=?',[actor.accountId])).toHaveLength(1);
  });
});
