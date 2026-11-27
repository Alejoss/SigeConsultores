import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('../../annual/requestScope',()=>({runInAnnualRequestScope:vi.fn(async(_options,operation)=>operation())}));
// SQL identity hydration has dedicated integration coverage. Keep pure policy
// checks real here so the mocked annual store never receives a forbidden call.
vi.mock('../../_core/teamAccessPolicy', async importOriginal => {
  const actual = await importOriginal<typeof import('../../_core/teamAccessPolicy')>();
  return { ...actual, hydrateTeamAccessContext: async (ctx:any,opts:any) => {
    const leader=ctx.processLeader;
    const module=opts.path?actual.resolveTeamAccessModule(opts.path,opts.rawInput):undefined;
    const policy=leader?actual.buildTeamAccessPolicy({companyId:leader.companyId,accountId:leader.processLeaderId,ownProcessId:leader.processId,companyProcessIds:[leader.processId]}):undefined;
    const cloned={...ctx,requestMode:opts.mode,teamAccessModule:module,teamAccessPolicy:policy};
    if(module)actual.assertModuleAccess(cloned,module,opts.mode);
    return cloned;
  }};
});
vi.mock('../../annual/store',()=>({
  BASE_YEAR:2026,listWorkspaces:vi.fn(async()=>[]),getAnnualOverview:vi.fn(async()=>({trainingOrigins:{100:2026}})),
  createAnnualWorkspace:vi.fn(async(input)=>({id:5,...input})),incorporateApprovedProcess:vi.fn(async()=>({alreadyIncorporated:false})),
  closeAnnualWorkspace:vi.fn(async()=>({status:'closed'})),listHistoricalPendings:vi.fn(async()=>({sourceYear:2026,items:[]})),
}));
vi.mock('../../_core/companyPermissions',()=>({
  assertCompanyReadFromRawInput:vi.fn(async(ctx,getRawInput)=> { const input=await getRawInput(); if(ctx.user?.role!=='admin' && ctx.manager?.companyId!==input.companyId && ctx.processLeader?.companyId!==input.companyId) throw Error('Empresa prohibida'); }),
  assertCompanyPersonnelManagementFromRawInput:vi.fn(async(ctx,getRawInput)=> { const input=await getRawInput(); if(ctx.user?.role!=='admin' && ctx.manager?.companyId!==input.companyId) throw Error('Solo Gerencia'); }),
  assertCompanyManagementFromRawInput:vi.fn(),
}));
import { annualWorkspacesRouter } from '../annualWorkspaces';
import { closeAnnualWorkspace, createAnnualWorkspace } from '../../annual/store';
import { runInAnnualScope } from '../../annual/runtime';
const strategy={purpose:true,mission:true,vision:true,values:true,policy:true,strategicObjectives:true};
const ctx=(extra:any={})=>({req:{headers:{}},res:{},user:null,manager:null,processLeader:null,...extra}) as any;
beforeEach(()=>vi.clearAllMocks());
describe('annualWorkspaces fixed API',()=> {
  it('returns baseYear and trainingOrigins with read guard',async()=> {
    const caller=annualWorkspacesRouter.createCaller(ctx({manager:{companyId:1,managerEmail:'fixture@example.invalid'}}));
    expect(await caller.list({companyId:1})).toEqual({workspaces:[],baseYear:2026});
    expect(await caller.overview({companyId:1,year:2027})).toMatchObject({trainingOrigins:{100:2026}});
  });
  it('refuses anonymous identity, foreign company and coordinator annual management',async()=> {
    await expect(annualWorkspacesRouter.createCaller(ctx()).list({companyId:1})).rejects.toThrow();
    const manager=annualWorkspacesRouter.createCaller(ctx({manager:{companyId:2,managerEmail:'fixture@example.invalid'}}));
    await expect(manager.list({companyId:1})).rejects.toThrow();
    const leader=annualWorkspacesRouter.createCaller(ctx({processLeader:{companyId:1,processId:3,processLeaderId:4}}));
    await expect(leader.create({companyId:1,year:2027,sourceYear:2026,strategy})).rejects.toThrow(/Gerencia/);
    expect(createAnnualWorkspace).not.toHaveBeenCalled();
  });
  it('requires all six booleans and exact CERRAR year confirmation',async()=> {
    const caller=annualWorkspacesRouter.createCaller(ctx({user:{id:9,role:'admin',name:'Fixture'}}));
    await expect(caller.create({companyId:1,year:2027,sourceYear:2026,strategy:{purpose:true} as any})).rejects.toThrow();
    await expect(caller.close({companyId:1,year:2026,confirmation:'CERRAR 2026 '})).rejects.toThrow(/Confirmación/);
    expect(closeAnnualWorkspace).not.toHaveBeenCalled();
    expect(await caller.close({companyId:1,year:2026,confirmation:'CERRAR 2026'})).toEqual({status:'closed'});
    expect(closeAnnualWorkspace).toHaveBeenCalledWith(expect.objectContaining({actor:{role:'admin',accountId:9,name:'Fixture'}}));
  });
  it('rejects input company different from captured annual scope',async()=> {
    const caller=annualWorkspacesRouter.createCaller(ctx({user:{id:9,role:'admin'}}));
    await runInAnnualScope({id:5,companyId:2,year:2027,sourceYear:2026,status:'open',storage:'namespace',strategy},async()=> {
      await expect(caller.overview({companyId:1,year:2027})).rejects.toThrow(/distinta/);
    });
  });
});
