import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context";

/** Any authenticated SIGE session: platform user, company manager, or process leader. */
export function isAuthenticated(ctx: TrpcContext): boolean {
  return !!(ctx.user || ctx.manager || ctx.processLeader);
}

/** Company id implied by the current session (manager / process leader). Platform users have no fixed company. */
export function getSessionCompanyId(ctx: TrpcContext): number | null {
  if (ctx.manager?.companyId) return ctx.manager.companyId;
  if (ctx.processLeader?.companyId) return ctx.processLeader.companyId;
  return null;
}

/** Process id for process-leader sessions only. */
export function getSessionProcessId(ctx: TrpcContext): number | null {
  return ctx.processLeader?.processId ?? null;
}

/**
 * Ensures the caller may access data for `companyId`.
 * - Managers: only their company.
 * - Process leaders: only their company.
 * - Platform admin: any company.
 * - Other platform users: allowed (legacy; UI scopes company).
 */
export function assertCompanyAccess(ctx: TrpcContext, companyId: number): void {
  if (!isAuthenticated(ctx)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please login (10001)" });
  }
  if (ctx.user?.role === "admin") return;
  const sessionCompanyId = getSessionCompanyId(ctx);
  if (sessionCompanyId != null && sessionCompanyId !== companyId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tienes acceso a esta empresa",
    });
  }
}

/**
 * Process leaders may only access their assigned process unless platform admin.
 */
export function assertProcessAccess(ctx: TrpcContext, processId: number): void {
  if (!isAuthenticated(ctx)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please login (10001)" });
  }
  if (ctx.user?.role === "admin") return;
  const leaderProcessId = getSessionProcessId(ctx);
  if (leaderProcessId != null && leaderProcessId !== processId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tienes acceso a este proceso",
    });
  }
}
