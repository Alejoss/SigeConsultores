import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { companyReadProcedure, companyPersonnelManagementProcedure, router } from '../_core/trpc';
import type { TrpcContext } from '../_core/context';
import { getAnnualScope, withoutAnnualScope } from '../annual/runtime';
import {
  BASE_YEAR, listWorkspaces, getAnnualOverview, createAnnualWorkspace,
  incorporateApprovedProcess, closeAnnualWorkspace, listHistoricalPendings,
} from '../annual/store';
import type { AnnualActor } from '../annual/store';
const companyInput = z.object({ companyId:z.number().int().positive() });
const yearInput = companyInput.extend({year:z.number().int().min(BASE_YEAR).max(2100)});
export const annualStrategyInput = z.object({purpose:z.boolean(),mission:z.boolean(),vision:z.boolean(),values:z.boolean(),policy:z.boolean(),strategicObjectives:z.boolean()}).strict();
function actor(ctx:TrpcContext):AnnualActor {
  if (ctx.user?.role==='admin') return {role:'admin',accountId:ctx.user.id,name:ctx.user.name};
  if (ctx.manager) return {role:'manager',companyId:ctx.manager.companyId,name:ctx.manager.managerEmail};
  throw new TRPCError({code:'FORBIDDEN',message:'Solo Gerencia o Administrador puede gestionar años'});
}
function assertSelectedCompany(companyId:number,ctx:TrpcContext):void {
  const header=ctx.req.headers['x-isge-company-id'];
  if (header!==undefined && (typeof header!=='string' || !/^\d+$/.test(header) || Number(header)!==companyId)) throw new TRPCError({code:'FORBIDDEN',message:'Empresa de input distinta del header anual'});
  const scope=getAnnualScope();
  if (scope && scope.workspace.companyId!==companyId) throw new TRPCError({code:'FORBIDDEN',message:'Empresa de input distinta de selección anual'});
}
/** Annual metadata/control routes are global. Their explicit target year may
 * differ from the currently selected source year (create/incorporation UI).
 */
export const annualWorkspacesRouter=router({
  list:companyReadProcedure.input(companyInput).query(async({input,ctx})=> {
    assertSelectedCompany(input.companyId,ctx);
    return withoutAnnualScope(async()=>({workspaces:await listWorkspaces(input.companyId),baseYear:BASE_YEAR}));
  }),
  overview:companyReadProcedure.input(yearInput).query(async({input,ctx})=> {
    assertSelectedCompany(input.companyId,ctx);
    return withoutAnnualScope(()=>getAnnualOverview(input.companyId,input.year));
  }),
  create:companyPersonnelManagementProcedure.input(yearInput.extend({sourceYear:z.number().int().min(BASE_YEAR).max(2099),strategy:annualStrategyInput})).mutation(async({input,ctx})=> {
    assertSelectedCompany(input.companyId,ctx);
    return withoutAnnualScope(()=>createAnnualWorkspace({...input,actor:actor(ctx)}));
  }),
  incorporateProcess:companyPersonnelManagementProcedure.input(yearInput.extend({processId:z.number().int().positive()})).mutation(async({input,ctx})=> {
    assertSelectedCompany(input.companyId,ctx);
    return withoutAnnualScope(()=>incorporateApprovedProcess({...input,actor:actor(ctx)}));
  }),
  close:companyPersonnelManagementProcedure.input(yearInput.extend({confirmation:z.string()})).mutation(async({input,ctx})=> {
    assertSelectedCompany(input.companyId,ctx);
    if (input.confirmation!==`CERRAR ${input.year}`) throw new TRPCError({code:'BAD_REQUEST',message:`Confirmación requerida: CERRAR ${input.year}`});
    return withoutAnnualScope(()=>closeAnnualWorkspace({...input,actor:actor(ctx)}));
  }),
  historicalPendings:companyReadProcedure.input(yearInput).query(async({input,ctx})=> {
    assertSelectedCompany(input.companyId,ctx);
    return withoutAnnualScope(()=>listHistoricalPendings(input.companyId,input.year));
  }),
});
