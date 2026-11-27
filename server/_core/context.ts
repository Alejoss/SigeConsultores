import { parse as parseCookieHeader } from "cookie";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { applySessionCookie } from "./cookies";
import { resolveAuthFromRequest } from "./resolveRequestAuth";
import type { TeamModuleKey, TeamRequestMode } from "../../shared/teamAccess";
import type { TeamAccessPolicy } from "./teamAccessPolicy";

export type ManagerContext = {
  companyId: number;
  companyName: string;
  managerEmail: string;
};

export type ProcessLeaderContext = {
  processLeaderId: number;
  leaderName: string;
  leaderEmail: string;
  processId: number;
  companyId: number;
  companyName: string;
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  manager: ManagerContext | null;
  processLeader: ProcessLeaderContext | null;
  /** Populated on a cloned per-procedure context, never the HTTP batch context. */
  teamAccessPolicy?: TeamAccessPolicy;
  teamAccessModule?: TeamModuleKey;
  requestMode?: TeamRequestMode;
};

function sessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const value = parseCookieHeader(cookieHeader)[COOKIE_NAME];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const { user, manager, processLeader } = await resolveAuthFromRequest(opts.req);
  const token = sessionToken(opts.req.headers.cookie);
  if (token && (user || manager || processLeader)) {
    applySessionCookie(opts.res, opts.req, token, ONE_YEAR_MS);
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    manager,
    processLeader,
  };
}
