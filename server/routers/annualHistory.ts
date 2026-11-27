import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { companyReadProcedure, companyProcedure, router } from '../_core/trpc';
import type { TrpcContext } from '../_core/context';
import { getAnnualScope, withoutAnnualScope } from '../annual/runtime';
import { BASE_YEAR } from '../annual/store';
import { HISTORICAL_ID_PATTERN, listAnnualHistory, resolveAnnualHistory } from '../annual/history';
const yearInput = z.object({ companyId: z.number().int().positive(), year: z.number().int().min(BASE_YEAR).max(2100) });
function assertSelectedCompany(companyId: number, ctx: TrpcContext): void {
  const header = ctx.req.headers['x-isge-company-id'];
  if (header !== undefined && (typeof header !== 'string' || !/^\d+$/.test(header) || Number(header) !== companyId)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Empresa de input distinta del header anual' });
  const scope = getAnnualScope();
  if (scope && scope.workspace.companyId !== companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Empresa de input distinta de selección anual' });
}
/** Canonical control router. Register annualHistory as exempt from the business
 * requestScope, like annualWorkspaces. Services explicitly validate/lock the
 * destination, allowing historical sources to remain closed and immutable.
 */
export const annualHistoryRouter = router({
  list: companyReadProcedure.input(yearInput.extend({ processId: z.number().int().positive().optional() }).strict()).query(async ({ input, ctx }) => {
    assertSelectedCompany(input.companyId, ctx);
    return withoutAnnualScope(() => listAnnualHistory(input, ctx));
  }),
  resolve: companyProcedure.input(yearInput.extend({ id: z.string().regex(HISTORICAL_ID_PATTERN), status: z.enum(['pending', 'completed']), notes: z.string().max(2000) }).strict()).mutation(async ({ input, ctx }) => {
    assertSelectedCompany(input.companyId, ctx);
    return withoutAnnualScope(() => resolveAnnualHistory(input, ctx));
  }),
});
