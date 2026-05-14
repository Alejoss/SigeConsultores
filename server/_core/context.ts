import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { resolveAuthFromRequest } from "./resolveRequestAuth";

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
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const { user, manager, processLeader } = await resolveAuthFromRequest(opts.req);

  return {
    req: opts.req,
    res: opts.res,
    user,
    manager,
    processLeader,
  };
}
