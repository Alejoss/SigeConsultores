import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('../db',()=>({getDatabasePool:vi.fn(()=>{throw new Error('Unit tests must not connect to DB');})}));
import { ANNUAL_TABLE_MANIFEST, BUSINESS_TABLE_NAMES, namespaceTable, COMMITMENT_SOURCE_TABLES } from '../annual/manifest';
import { newYearDataset, canonicalizePolicyParents, validateAnnualDependencies, annualHash, resetApprovedExecution, companyOwnershipPredicate } from '../annual/migration';
import { normalizeAnnualFileKey, assertAnnualManager, validateStrategy, PRESERVE_STRATEGY } from '../annual/store';
import type { AnnualDataset } from '../annual/migration';
import type { AnnualWorkspaceRecord } from '../annual/store';
const workspace:AnnualWorkspaceRecord={id:10,companyId:990101,year:2027,sourceYear:2026,status:'open',storage:'namespace',strategy:{...PRESERVE_STRATEGY}};
const empty=():AnnualDataset=>new Map(BUSINESS_TABLE_NAMES.map(t=>[t,[]]));
describe('annual core manifest and preservation',()=> {
  it('classifies all 125 original tables and the additive canonical team tables',()=> {
    const schema=readFileSync(new URL('../../drizzle/schema.ts',import.meta.url),'utf8');
    const names=Array.from(schema.matchAll(/mysqlTable\(\s*["']([^"']+)["']/g)).map(m=>m[1]).filter(t=>!t.startsWith('annual'));
    const teamTables=['companyTeamModuleAccess','companyTeamProcessAccess','companyTeamAccessAudit'];
    expect(names.filter(name=>!teamTables.includes(name))).toHaveLength(125);
    expect(ANNUAL_TABLE_MANIFEST).toHaveLength(125+teamTables.length);
    expect(new Set(ANNUAL_TABLE_MANIFEST.map(t=>t.table)).size).toBe(names.length);
    expect(new Set(ANNUAL_TABLE_MANIFEST.map(t=>t.table))).toEqual(new Set(names));
    expect(BUSINESS_TABLE_NAMES.every(t=>ANNUAL_TABLE_MANIFEST.find(m=>m.table===t)?.ownership)).toBe(true);
    for(const table of teamTables){
      expect(ANNUAL_TABLE_MANIFEST.find(m=>m.table===table)?.policy).toBe('shared');
      expect(BUSINESS_TABLE_NAMES).not.toContain(table);
      expect(()=>namespaceTable(10,table)).toThrow();
    }
    for (const t of names.filter(t=>t.startsWith('course') || t.startsWith('planningCycle'))) expect(BUSINESS_TABLE_NAMES).not.toContain(t);
    for (const t of ['accounts','companies','auth_sessions','account_roles']) expect(BUSINESS_TABLE_NAMES).not.toContain(t);
  });
  it('keeps numeric local identity distinct by namespace',()=> {
    expect(namespaceTable(10,'audits')).toBe('aw_10_audits');
    expect(namespaceTable(11,'audits')).not.toBe(namespaceTable(10,'audits'));
    expect(()=>namespaceTable(-1,'audits')).toThrow();
    expect(()=>namespaceTable(10,'accounts')).toThrow();
    expect(()=>namespaceTable(10,'audits; DELETE FROM accounts')).toThrow();
  });
  it('preserves audits, compliance, corporate training and its execution exactly; zero programs/inspections',()=> {
    const source=empty();
    const audit={id:101,companyId:990101,auditDate:'2026',closuresMajorNC:9};
    const compliance={id:102,companyId:990101,completed:'SI',completedMonths:'1,2',validUntil:'2026-01-01',evidencePdfKey:'uploads/old.pdf'};
    const training={id:103,companyId:990101,plannedDate:null,conductedDate:'2026-04-01',completed:'SI',actualAttendees:24};
    source.set('audits',[audit]);source.set('companyCompliances',[compliance]);source.set('companyTrainings',[training]);
    source.set('managementPrograms',[{id:104,companyId:990101,planFileKey:'uploads/plan.pdf',plannedActions:99,completedActions:98}]);
    source.set('programActions',[{id:105,companyId:990101,programId:104}]);
    source.set('programActionBaselines',[{id:106,companyId:990101,programId:104,legacyPlannedActions:99,legacyCompletedActions:98}]);
    source.set('inspections',[{id:107,companyId:990101}]);
    source.set('operationalFindings',[{id:108,sourceType:'audit',sourceId:101,completed:1},{id:109,sourceType:'inspection',sourceId:107}]);
    source.set('linkedCommitments',[{id:110,sourceType:'audit_finding',sourceId:108,sourceSubId:108},{id:111,sourceType:'program_action',sourceId:105,sourceSubId:104}]);
    source.set('linkedCommitmentEvidence',[{id:112,linkedCommitmentId:110,fileKey:'a.pdf'},{id:113,linkedCommitmentId:111,fileKey:'b.pdf'}]);
    const before=annualHash(Array.from(source));
    const target=newYearDataset(source,workspace);
    expect(target.get('audits')).toEqual([audit]);expect(target.get('companyCompliances')).toEqual([compliance]);expect(target.get('companyTrainings')).toEqual([training]);
    expect(target.get('programActions')).toEqual([]);expect(target.get('inspections')).toEqual([]);
    expect(target.get('managementPrograms')?.[0]).toMatchObject({planFileKey:'uploads/plan.pdf',plannedActions:0,completedActions:0});
    expect(target.get('programActionBaselines')?.[0]).toMatchObject({legacyPlannedActions:0,legacyCompletedActions:0});
    expect(target.get('operationalFindings')).toEqual([{id:108,sourceType:'audit',sourceId:101,completed:1}]);
    expect(target.get('linkedCommitments')).toHaveLength(1);expect(target.get('linkedCommitmentEvidence')).toHaveLength(1);
    expect(annualHash(Array.from(source))).toBe(before);
  });
  it('preserves org/positions/stable payroll while process is pending; no prior results',()=> {
    const source=empty();
    for (const table of ['processes','processParticipants','processParticipantCompetencies','participantWorkerAssignments','payrollEmployees','organizationChart','organizationChartNodes']) source.set(table,[{id:20,companyId:990101,position:'Jefe',identityCard:'stable'}]);
    source.set('processCharacterizations',[{id:20,processId:20,responsible:'Gerente',responsibleEmail:'fixture.invalid',payrollAreaSelection:'{"mode":"areas","areas":["A"]}',objective:'old',scope:'old'}]);
    source.set('participantWorkerKpiValues',[{id:21,actualValue:100}]);
    source.set('processFODA',[{id:22,matrixData:'[]'}]);
    const target=newYearDataset(source,workspace);
    expect(target.get('payrollEmployees')).toEqual(source.get('payrollEmployees'));
    expect(target.get('processParticipants')).toEqual(source.get('processParticipants'));
    expect(target.get('processCharacterizations')?.[0]).toMatchObject({responsible:'Gerente',objective:'',scope:'',payrollAreaSelection:'{"mode":"areas","areas":["A"]}'});
    expect(target.get('participantWorkerKpiValues')).toEqual([]);expect(target.get('processFODA')).toEqual([]);
  });
  it('honors all six explicit strategy flags, preserving configs but no measurements',()=> {
    const source=empty();source.set('companyInfo',[{id:1,proposito:'p',mision:'m',vision:'v',adminAlertEmail:'keep'}]);
    for (const table of ['companyValues','policies','policyObjectives','strategicObjectives','strategicObjectiveMeasurementConfigs','strategicObjectiveMeasurements']) source.set(table,[{id:1}]);
    const target=newYearDataset(source,{...workspace,strategy:{purpose:false,mission:true,vision:false,values:false,policy:false,strategicObjectives:true}});
    expect(target.get('companyInfo')?.[0]).toEqual({id:1,proposito:'',mision:'m',vision:'',adminAlertEmail:'keep'});
    expect(target.get('policies')).toEqual([]);expect(target.get('policyObjectives')).toEqual([]);expect(target.get('companyValues')).toEqual([]);
    expect(target.get('strategicObjectiveMeasurementConfigs')).toHaveLength(1);expect(target.get('strategicObjectiveMeasurements')).toEqual([]);
    expect(()=>validateStrategy({...PRESERVE_STRATEGY})).not.toThrow();
    expect(()=>validateStrategy({purpose:true} as any)).toThrow(/seis/);
  });
  it('canonicalizes only a provable legacy policy parent, rejects ambiguity',()=> {
    const data=empty();data.set('policies',[{id:80,companyId:990101}]);data.set('policyObjectives',[{id:81,policyId:990101}]);
    canonicalizePolicyParents(data,990101);expect(data.get('policyObjectives')?.[0].policyId).toBe(80);
    data.set('policies',[{id:80},{id:82}]);data.set('policyObjectives',[{id:81,policyId:990101}]);
    expect(()=>canonicalizePolicyParents(data,990101)).toThrow(/canónica/);
  });
  it('validates typed polymorphic identity, never numeric global fallback',()=> {
    const data=empty();data.set('processes',[{id:1}]);data.set('companyCompliances',[{id:5}]);data.set('linkedCommitments',[{id:2,processId:1,sourceType:'company_compliance',sourceId:5,sourceSubId:5}]);
    expect(()=>validateAnnualDependencies(data)).not.toThrow();
    data.set('linkedCommitments',[{id:2,processId:1,sourceType:'program_action',sourceId:5,sourceSubId:5}]);
    expect(()=>validateAnnualDependencies(data)).toThrow(/programActions/);
    expect(COMMITMENT_SOURCE_TABLES.audit_finding).toEqual(['operationalFindings','operationalFindings']);
  });
  it('resets approved execution only, keeps exact IDs, dates and unknown JSON fields',()=> {
    const input={id:'oo-exact',tasks:[{id:'task-exact',description:'keep',date:'2026-05-01',percentageCompleted:80,monthlyProgress:[8],unknownField:{a:7}}],metaLlegada:60};
    const reset=resetApprovedExecution(input);
    expect(reset.tasks[0]).toEqual({id:'task-exact',description:'keep',date:'2026-05-01',percentageCompleted:0,monthlyProgress:[],unknownField:{a:7}});
    expect(input.tasks[0].percentageCompleted).toBe(80);
  });
  it('has explicit company indirect predicates and normalizes retentions identically to storage',()=> {
    expect(companyOwnershipPredicate(workspace,'procedureRecords')).toContain('aw_10_procedures');
    expect(companyOwnershipPredicate(workspace,'procedureRecords')).toContain('aw_10_processes');
    expect(companyOwnershipPredicate(workspace,'procedureRecords')).toContain('990101');
    expect(normalizeAnnualFileKey('/documents/a.pdf')).toBe('uploads/documents/a.pdf');
    expect(normalizeAnnualFileKey('uploads/documents/a.pdf')).toBe('uploads/documents/a.pdf');
    expect(()=>assertAnnualManager({role:'manager',companyId:2},990101)).toThrow();
    expect(()=>assertAnnualManager({role:'coordinator',companyId:990101},990101)).toThrow();
    expect(()=>assertAnnualManager({role:'admin'},990101)).not.toThrow();
  });
});
