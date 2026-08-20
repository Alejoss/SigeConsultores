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

  const candidates = await db
    .select()
    .from(accounts)
    .where(and(sql`LOWER(${accounts.email}) = ${emailNorm}`, eq(accounts.status, "active")));

  // El mismo correo puede tener accesos independientes en distintas empresas.
  // La contraseña valida cuál de esas cuentas se desea usar, sin combinar roles.
  const passwordMatches = [] as typeof candidates;
  for (const candidate of candidates) {
    if (candidate.passwordHash && await bcrypt.compare(password, candidate.passwordHash)) {
      passwordMatches.push(candidate);
    }
  }

  let matched = passwordMatches;
  if (processIdFilter != null) {
    const plRoleId = await getRoleIdBySlug(db, "process_leader");
    if (plRoleId == null) return { status: 401, error: "Email o contraseña incorrectos" };
    const scoped = [] as typeof candidates;
    for (const candidate of passwordMatches) {
      const scope = await db
        .select({ id: accountRoles.id })
        .from(accountRoles)
        .where(
          and(
            eq(accountRoles.accountId, candidate.id),
            eq(accountRoles.roleId, plRoleId),
            eq(accountRoles.status, "active"),
            eq(accountRoles.processId, processIdFilter)
          )
        )
        .limit(1);
      if (scope.length) scoped.push(candidate);
    }
    matched = scoped;
  }

  if (matched.length !== 1) {
    return { status: 401, error: "Email o contraseña incorrectos" };
  }

  const acc = matched[0];
  await db.update(accounts).set({ lastSignedIn: new Date() }).where(eq(accounts.id, acc.id));
  return { accountId: acc.id };
}

export async function completeUnifiedLoginSession(
  result: UnifiedLoginSuccess
): Promise<{ plainToken: string }> {
  return createAuthSession({ accountId: result.accountId });
}
