import type { Request, Response } from 'express';
import type { TrpcContext } from './context';
import type { TeamModuleKey } from '../../shared/teamAccess';
import { resolveAuthFromRequest } from './resolveRequestAuth';
import { assertModuleAccess, canAccessProcess, hydrateTeamAccessContext } from './teamAccessPolicy';
import { assertCompanyReadAccess, assertProcessAccessById } from './companyPermissions';

/** Reuses only this request's hydrated context; never shares a policy across calls. */
export async function getTeamAccessHttpContext(req: Request, res: Response, module?: TeamModuleKey): Promise<TrpcContext> {
  let ctx = res.locals.teamAccessContext as TrpcContext | undefined;
  const mode = ["GET", "HEAD", "OPTIONS"].includes(req.method) ? "read" : "write";
  if (!ctx) {
    const auth = await resolveAuthFromRequest(req);
    ctx = await hydrateTeamAccessContext({ ...auth, req, res }, { mode, module });
    res.locals.teamAccessContext = ctx;
  }
  if (module) {
    assertModuleAccess(ctx, module, mode);
    ctx = { ...ctx, teamAccessModule: module, requestMode: mode };
  }
  return ctx;
}

export async function canManageHttpProcess(ctx: TrpcContext, processId: number, companyId: number): Promise<boolean> {
  try {
    assertCompanyReadAccess(ctx, companyId);
    const process = await assertProcessAccessById({ ...ctx, requestMode: 'write' }, processId);
    if (process.companyId !== companyId) return false;
    if (ctx.user?.role === 'admin' || ctx.manager?.companyId === companyId) return true;
    return canAccessProcess(ctx.teamAccessPolicy, processId, 'write', companyId);
  } catch {
    return false;
  }
}
