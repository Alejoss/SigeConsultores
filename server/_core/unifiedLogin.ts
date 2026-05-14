import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import type { getDb } from "../db";

/** DB instance from `getDb()` once connected */
export type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
import { accounts, accountRoles } from "../../drizzle/schema";
import { createAuthSession } from "../authSessionRepository";
import { getRoleIdBySlug } from "../accountAuth";

/**
 * Single email maps to at most one `accounts` row; password is only in `accounts.password_hash`.
 */
export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type UnifiedLoginSuccess = { accountId: number };

export type UnifiedLoginFailure = { status: 401 | 400; error: string };

export async function tryUnifiedLogin(
  db: AppDb,
  emailRaw: string,
  password: string,
  processIdFilter?: number
): Promise<UnifiedLoginSuccess | UnifiedLoginFailure> {
  const emailNorm = normalizeLoginEmail(emailRaw);

  const rows = await db
    .select()
    .from(accounts)
    .where(and(sql`LOWER(${accounts.email}) = ${emailNorm}`, eq(accounts.status, "active")))
    .limit(1);

  const acc = rows[0];
  if (!acc?.passwordHash) {
    return { status: 401, error: "Email o contraseña incorrectos" };
  }

  const ok = await bcrypt.compare(password, acc.passwordHash);
  if (!ok) {
    return { status: 401, error: "Email o contraseña incorrectos" };
  }

  if (processIdFilter != null) {
    const plRoleId = await getRoleIdBySlug(db, "process_leader");
    if (plRoleId == null) {
      return { status: 401, error: "Email o contraseña incorrectos" };
    }
    const scope = await db
      .select({ id: accountRoles.id })
      .from(accountRoles)
      .where(
        and(
          eq(accountRoles.accountId, acc.id),
          eq(accountRoles.roleId, plRoleId),
          eq(accountRoles.processId, processIdFilter)
        )
      )
      .limit(1);
    if (!scope.length) {
      return { status: 401, error: "Email o contraseña incorrectos" };
    }
  }

  await db.update(accounts).set({ lastSignedIn: new Date() }).where(eq(accounts.id, acc.id));

  return { accountId: acc.id };
}

export async function completeUnifiedLoginSession(
  result: UnifiedLoginSuccess
): Promise<{ plainToken: string }> {
  return createAuthSession({ accountId: result.accountId });
}
