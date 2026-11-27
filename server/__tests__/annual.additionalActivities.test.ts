import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('../db',()=>({getDatabasePool:vi.fn(()=>{throw new Error('Unit must not connect');})}));
import { additionalDateInYear, resetAdditionalCommitment, resetAdditionalPeriod } from '../annual/additionalActivities';
import { annualHash, validateAnnualDependencies, newYearDataset } from '../annual/migration';
import { BUSINESS_TABLE_NAMES } from '../annual/manifest';
import { PRESERVE_STRATEGY } from '../annual/store';
import type { AnnualWorkspaceRecord } from '../annual/store';
const target:AnnualWorkspaceRecord={id:42,companyId:9,year:2027,sourceYear:2026,status:'open',storage:'namespace',strategy:{...PRESERVE_STRATEGY}};
const empty=()=>new Map(BUSINESS_TABLE_NAMES.map(t=>[t,[] as any[]]));
describe('additional annual activities exact identity',()=>{
  it('appends exact two item types in all three enums without reordering',()=>{
    const schema=readFileSync(new URL('../../drizzle/schema.ts',import.meta.url),'utf8');
    const enums=Array.from(schema.matchAll(/itemType: mysqlEnum\("itemType", \[([^\]]+)\]/g));
    expect(enums).toHaveLength(3);
    for(const match of enums) expect(Array.from(match[1].matchAll(/"([^"]+)"/g)).map(m=>m[1])).toEqual(['ote','otg','stakeholder_action','compliance','participant_kpi','linked_commitment','output_release']);
  });
  it('replans both done and pending commitments without evidence/execution or source mutation',()=>{
    for(const status of ['pending','completed']) {
      const row={id:3,sourceType:'program_action',sourceId:10,sourceSubId:20,sourceWorkspaceId:null,title:'Exact action',dueDate:new Date('2026-11-20T00:00:00Z'),status,completedAt:new Date(),renewedValidFrom:'2026-01-01',renewedValidUntil:'2026-12-31',notes:'historical evidence'};
      const hash=annualHash(row);
      const result=resetAdditionalCommitment(row,target,{workspaceId:41});
      expect(result).toMatchObject({id:3,sourceType:'program_action',sourceId:10,sourceSubId:20,sourceWorkspaceId:41,dueDate:'2027-11-20',status:'pending',completedAt:null,notes:null,renewedValidFrom:null,renewedValidUntil:null});
      expect(annualHash(row)).toBe(hash);
    }
  });
  it('keeps own identity own and keeps historical source namespace instead of implicit current source',()=>{
    expect(resetAdditionalCommitment({id:3,sourceType:'own',sourceId:null,sourceSubId:null},target,null).sourceWorkspaceId).toBeNull();
    expect(resetAdditionalCommitment({id:4,sourceType:'meeting_agreement',sourceWorkspaceId:40,sourceId:7,sourceSubId:8},target,{workspaceId:40}).sourceWorkspaceId).toBe(40);
  });
  it('replans selected periods only and clears all release execution fields',()=>{
    for(const status of ['pending','released','exception']) {
      const row={id:5,controlId:6,processId:7,periodKey:'scheduled:2026-10-15',scheduledDate:'2026-10-15',status,releasedAt:new Date(),releasedByAccountId:99,observations:'old execution'};
      const before=annualHash(row);
      expect(resetAdditionalPeriod(row,2027)).toMatchObject({id:5,controlId:6,periodKey:'scheduled:2027-10-15',scheduledDate:'2027-10-15',status:'pending',releasedAt:null,releasedByAccountId:null,observations:null});
      expect(annualHash(row)).toBe(before);
    }
  });
  it('does not guess opaque period keys or normalize impossible leap-day dates',()=>{
    expect(resetAdditionalPeriod({periodKey:'event:exact-id',scheduledDate:'2026-12-01'},2027).periodKey).toBe('event:exact-id');
    expect(()=>additionalDateInYear('2024-02-29',2027)).toThrow(/no existe/);
    expect(()=>additionalDateInYear('not-date',2027)).toThrow(/inválida/);
  });
  it('requires externally verified historical references, never local parent fallback',()=>{
    const data=empty();data.set('processes',[{id:1}]);
    const row={id:2,processId:1,sourceType:'program_action',sourceId:3,sourceSubId:4,sourceWorkspaceId:41};data.set('linkedCommitments',[row]);
    expect(()=>validateAnnualDependencies(data)).toThrow(/histórica exacta/);
    const references=new Map([[2,{workspaceId:41,sourceType:'program_action',entity:{table:'programActions',id:3},parent:{table:'managementPrograms',id:4}}]]);
    expect(()=>validateAnnualDependencies(data,references)).not.toThrow();
    expect(()=>validateAnnualDependencies(data,new Map([[2,{...references.get(2),workspaceId:42}]]))).toThrow(/histórica exacta/);
  });
  it('keeps corporate execution exactly on workspace creation while program/inspection source stays excluded',()=>{
    const source=empty();
    source.set('linkedCommitments',[{id:1,sourceType:'audit_finding',status:'completed',sourceWorkspaceId:40},{id:2,sourceType:'program_action',status:'pending'},{id:3,sourceType:'inspection_finding',status:'pending'}]);
    source.set('linkedCommitmentEvidence',[{id:8,linkedCommitmentId:1,fileKey:'old-audit.pdf'},{id:9,linkedCommitmentId:2,fileKey:'old-program.pdf'}]);
    source.set('processOutputReleasePeriods',[{id:10,status:'released'}]);source.set('processOutputReleaseControls',[{id:11}]);
    const rows=newYearDataset(source,target);
    expect(rows.get('linkedCommitments')).toEqual([source.get('linkedCommitments')![0]]);
    expect(rows.get('linkedCommitmentEvidence')).toEqual([source.get('linkedCommitmentEvidence')![0]]);
    expect(rows.get('processOutputReleaseControls')).toEqual([]);expect(rows.get('processOutputReleasePeriods')).toEqual([]);
  });
});
