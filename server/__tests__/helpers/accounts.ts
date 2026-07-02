import { eq, and } from "drizzle-orm";
import {
  accounts,
  accountRoles,
  roles,
  type InsertAccount,
} from "../../../drizzle/schema";
import type { getDb } from "../../db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const PLATFORM_ROLE_SEEDS = [
  { slug: "platform_admin", label: "Platform Admin" },
  { slug: "platform_user", label: "Platform User" },
  { slug: "company_manager", label: "Company Manager" },
  { slug: "process_leader", label: "Process Leader" },
] as const;

/** Ensures canonical role rows exist (CI runs db:push but not always roles:seed). */
export async function ensurePlatformRoles(db: Db): Promise<void> {
  for (const role of PLATFORM_ROLE_SEEDS) {
    const existing = await db.select().from(roles).where(eq(roles.slug, role.slug)).limit(1);
    if (existing.length === 0) {
      await db.insert(roles).values({ slug: role.slug, label: role.label });
    }
  }
}

export async function insertTestAccount(
  db: Db,
  data: Pick<InsertAccount, "openId"> & Partial<Pick<InsertAccount, "email" | "name" | "loginMethod">>
) {
  await db.insert(accounts).values({
    openId: data.openId,
    email: data.email ?? null,
    name: data.name ?? null,
    loginMethod: data.loginMethod ?? null,
    status: "active",
  });
  const row = await db.select().from(accounts).where(eq(accounts.openId, data.openId)).limit(1);
  if (!row[0]) throw new Error("Failed to insert test account");
  return row[0];
}

export async function getPlatformRoleSlug(db: Db, accountId: number): Promise<string | null> {
  const rows = await db
    .select({ slug: roles.slug })
    .from(accountRoles)
    .innerJoin(roles, eq(accountRoles.roleId, roles.id))
    .where(
      and(
        eq(accountRoles.accountId, accountId),
        eq(accountRoles.companyId, 0),
        eq(accountRoles.processId, 0)
      )
    )
    .limit(1);
  return rows[0]?.slug ?? null;
}

export async function deleteTestAccountsByEmails(db: Db, emails: string[]): Promise<void> {
  for (const email of emails) {
    const rows = await db.select().from(accounts).where(eq(accounts.email, email));
    for (const acc of rows) {
      await db.delete(accountRoles).where(eq(accountRoles.accountId, acc.id));
      await db.delete(accounts).where(eq(accounts.id, acc.id));
    }
  }
}

export async function deleteTestAccountByOpenIdPrefix(db: Db, prefix: string): Promise<void> {
  const rows = await db.select().from(accounts);
  for (const acc of rows) {
    if (acc.openId.startsWith(prefix)) {
      await db.delete(accountRoles).where(eq(accountRoles.accountId, acc.id));
      await db.delete(accounts).where(eq(accounts.id, acc.id));
    }
  }
}
