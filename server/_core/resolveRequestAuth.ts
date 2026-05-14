import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import { findActiveAuthSessionByPlainToken } from "../authSessionRepository";
import { getDb } from "../db";
import type { ManagerContext, ProcessLeaderContext } from "./context";
import { getManagerContext, getPlatformUserShape, getProcessLeaderContext } from "../accountAuth";

function getSessionCookieValue(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const cookies = parseCookieHeader(raw);
  const v = cookies[COOKIE_NAME];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function resolveAuthFromRequest(req: Request): Promise<{
  user: User | null;
  manager: ManagerContext | null;
  processLeader: ProcessLeaderContext | null;
}> {
  const plain = getSessionCookieValue(req);
  if (!plain) {
    return { user: null, manager: null, processLeader: null };
  }

  const row = await findActiveAuthSessionByPlainToken(plain);
  if (!row?.accountId) {
    return { user: null, manager: null, processLeader: null };
  }

  const db = await getDb();
  if (!db) {
    return { user: null, manager: null, processLeader: null };
  }

  const accountId = row.accountId;

  const platformUser = await getPlatformUserShape(db, accountId);
  if (platformUser) {
    return { user: platformUser, manager: null, processLeader: null };
  }

  const manager = await getManagerContext(db, accountId);
  if (manager) {
    return { user: null, manager, processLeader: null };
  }

  const processLeader = await getProcessLeaderContext(db, accountId);
  if (processLeader) {
    return { user: null, manager: null, processLeader };
  }

  return { user: null, manager: null, processLeader: null };
}
