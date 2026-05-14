import { and, eq } from "drizzle-orm";
import type { AppDb } from "./_core/unifiedLogin";
import {
  accounts,
  accountRoles,
  roles,
  companies,
  processes,
} from "../drizzle/schema";
import type { ManagerContext, ProcessLeaderContext } from "./_core/context";
import type { User } from "../drizzle/schema";

export async function getRoleIdBySlug(db: AppDb, slug: string): Promise<number | null> {
  const r = await db.select().from(roles).where(eq(roles.slug, slug)).limit(1);
  return r[0]?.id ?? null;
}

/** Platform user row for TRPC (`role` from platform_* assignment). */
export async function getPlatformUserShape(db: AppDb, accountId: number): Promise<User | null> {
  const ar = await db
    .select({ slug: roles.slug })
    .from(accountRoles)
    .innerJoin(roles, eq(accountRoles.roleId, roles.id))
    .where(
      and(eq(accountRoles.accountId, accountId), eq(accountRoles.companyId, 0), eq(accountRoles.processId, 0))
    );

  const slugs = new Set(ar.map((r) => r.slug));
  if (!slugs.has("platform_admin") && !slugs.has("platform_user")) return null;

  const a = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  const acc = a[0];
  if (!acc) return null;

  return {
    id: acc.id,
    openId: acc.openId,
    name: acc.name,
    email: acc.email,
    role: slugs.has("platform_admin") ? "admin" : "user",
  };
}

export async function getManagerContext(db: AppDb, accountId: number): Promise<ManagerContext | null> {
  const cmRoleId = await getRoleIdBySlug(db, "company_manager");
  if (cmRoleId == null) return null;

  const row = await db
    .select({
      companyId: accountRoles.companyId,
    })
    .from(accountRoles)
    .where(and(eq(accountRoles.accountId, accountId), eq(accountRoles.roleId, cmRoleId)))
    .limit(1);

  const companyId = row[0]?.companyId;
  if (!companyId || companyId === 0) return null;

  const c = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const comp = c[0];
  if (!comp) return null;

  const a = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  const acc = a[0];
  if (!acc?.email) return null;

  return {
    companyId: comp.id,
    companyName: comp.name,
    managerEmail: acc.email,
  };
}

export async function getProcessLeaderContext(
  db: AppDb,
  accountId: number
): Promise<ProcessLeaderContext | null> {
  const plRoleId = await getRoleIdBySlug(db, "process_leader");
  if (plRoleId == null) return null;

  const row = await db
    .select({
      companyId: accountRoles.companyId,
      processId: accountRoles.processId,
    })
    .from(accountRoles)
    .where(and(eq(accountRoles.accountId, accountId), eq(accountRoles.roleId, plRoleId)))
    .limit(1);

  const companyId = row[0]?.companyId;
  const processId = row[0]?.processId;
  if (!companyId || !processId || companyId === 0 || processId === 0) return null;

  const c = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const p = await db.select().from(processes).where(eq(processes.id, processId)).limit(1);
  const a = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  const comp = c[0];
  const proc = p[0];
  const acc = a[0];
  if (!comp || !proc || !acc) return null;

  return {
    processLeaderId: accountId,
    leaderName: acc.name || acc.email || "Process leader",
    leaderEmail: acc.email || "",
    processId,
    companyId,
    companyName: comp.name,
  };
}

/** Resolve PL context only if this account is leader for the given process. */
export async function getProcessLeaderContextForProcess(
  db: AppDb,
  accountId: number,
  processId: number
): Promise<ProcessLeaderContext | null> {
  const plRoleId = await getRoleIdBySlug(db, "process_leader");
  if (plRoleId == null) return null;

  const row = await db
    .select({
      companyId: accountRoles.companyId,
      processId: accountRoles.processId,
    })
    .from(accountRoles)
    .where(
      and(
        eq(accountRoles.accountId, accountId),
        eq(accountRoles.roleId, plRoleId),
        eq(accountRoles.processId, processId)
      )
    )
    .limit(1);

  const companyId = row[0]?.companyId;
  const procId = row[0]?.processId;
  if (!companyId || !procId || companyId === 0) return null;

  const c = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const p = await db.select().from(processes).where(eq(processes.id, procId)).limit(1);
  const a = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  const comp = c[0];
  const proc = p[0];
  const acc = a[0];
  if (!comp || !proc || !acc) return null;

  return {
    processLeaderId: accountId,
    leaderName: acc.name || acc.email || "Process leader",
    leaderEmail: acc.email || "",
    processId: procId,
    companyId,
    companyName: comp.name,
  };
}
