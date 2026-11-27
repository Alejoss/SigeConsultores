import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { accounts, accountRoles, companies, processes, roles } from "../../../drizzle/schema";
import type { getDb } from "../../db";
import { assertAnnualIntegrationDatabase } from "./annualTestSafety";

type FixtureDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** This fixture helper never writes to review/production or changes the role catalog. */
export function assertCanonicalFixtureDatabase(): void {
  assertAnnualIntegrationDatabase();
}

/** Each suite owns only inserted account/assignment IDs, not all rows in a company. */
export function createCanonicalChiefFixtures(suite: string) {
  const token = randomUUID();
  const identities = new Map<string, number>();
  const ownedAccounts: Array<{ id: number; openId: string }> = [];
  const ownedAssignments: Array<{ id: number; accountId: number; roleId: number; companyId: number; processId: number }> = [];
  let connection: FixtureDb | undefined;
  const key = (companyId: number, processId: number) => `${companyId}:${processId}`;

  return {
    accountId(companyId: number, processId: number): number {
      const id = identities.get(key(companyId, processId));
      if (!id) throw new Error(`${suite}: missing canonical chief fixture for ${companyId}/${processId}`);
      return id;
    },
    async register(db: FixtureDb, scope: { companyId: number; processId: number; accountId?: number }): Promise<number> {
      assertCanonicalFixtureDatabase();
      connection = db;
      if (identities.has(key(scope.companyId, scope.processId))) throw new Error(`${suite}: duplicate chief fixture scope`);
      const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, scope.companyId)).limit(1);
      const [process] = await db.select({ companyId: processes.companyId }).from(processes).where(eq(processes.id, scope.processId)).limit(1);
      if (!company || process?.companyId !== scope.companyId) throw new Error(`${suite}: chief fixture process does not belong to fixture company`);
      const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.slug, "process_leader")).limit(1);
      if (!role) throw new Error(`${suite}: canonical process_leader role must already exist`);
      let accountId = scope.accountId;
      if (accountId !== undefined) {
        const [account] = await db.select({ status: accounts.status }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
        if (account?.status !== "active") throw new Error(`${suite}: existing fixture account must be active`);
      } else {
        const openId = `chief-fixture-${token}-${ownedAccounts.length}`;
        const email = `${openId}@example.test`;
        const collision = await db.select({ id: accounts.id }).from(accounts).where(or(eq(accounts.openId, openId), eq(accounts.email, email))).limit(1);
        if (collision.length) throw new Error(`${suite}: account fixture identity collision; refusing to overwrite`);
        const inserted = await db.insert(accounts).values({ openId, email, name: `${suite} synthetic chief`, status: "active", loginMethod: "test" });
        accountId = Number(inserted[0].insertId);
        ownedAccounts.push({ id: accountId, openId });
      }
      const collision = await db.select({ id: accountRoles.id }).from(accountRoles).where(and(eq(accountRoles.accountId, accountId), eq(accountRoles.roleId, role.id), eq(accountRoles.companyId, scope.companyId), eq(accountRoles.processId, scope.processId))).limit(1);
      if (collision.length) throw new Error(`${suite}: assignment fixture collision; refusing to overwrite`);
      const inserted = await db.insert(accountRoles).values({ accountId, roleId: role.id, companyId: scope.companyId, processId: scope.processId, status: "active" });
      ownedAssignments.push({ id: Number(inserted[0].insertId), accountId, roleId: role.id, companyId: scope.companyId, processId: scope.processId });
      identities.set(key(scope.companyId, scope.processId), accountId);
      return accountId;
    },
    async cleanup(): Promise<void> {
      if (!connection) return;
      assertCanonicalFixtureDatabase();
      for (const row of ownedAssignments.splice(0).reverse()) {
        await connection.delete(accountRoles).where(and(eq(accountRoles.id, row.id), eq(accountRoles.accountId, row.accountId), eq(accountRoles.roleId, row.roleId), eq(accountRoles.companyId, row.companyId), eq(accountRoles.processId, row.processId)));
      }
      for (const row of ownedAccounts.splice(0).reverse()) {
        await connection.delete(accounts).where(and(eq(accounts.id, row.id), eq(accounts.openId, row.openId)));
      }
      identities.clear();
    },
  };
}
