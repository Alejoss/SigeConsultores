import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  accounts,
  accountRoles,
  annualWorkspaces,
  companies,
  companyInfo,
  companyManagementAccess,
  processes,
  roles,
} from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";
import { appRouter } from "../routers";
import { assertAnnualIntegrationDatabase } from "./helpers/annualTestSafety";

// Deliberately exercise the INLINE production path, not companyInfoRouter.
// Every mutable row belongs to this run; shared role definitions are read-only.
const fixtureToken = randomUUID();
const fixtureName = `company-info-inline-permission-${fixtureToken}`;
const ownAccountIds: number[] = [];
const ownCompanyIds: number[] = [];
const ownRoleAssignmentIds: number[] = [];
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId = 0;
let foreignCompanyId = 0;
let leaderAccountId = 0;
let processId = 0;
let standardAccessId = 0;

function context(
  overrides: Partial<Pick<TrpcContext, "user" | "manager" | "processLeader">>
): TrpcContext {
  return {
    user: null,
    manager: null,
    processLeader: null,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    ...overrides,
  };
}

function managerCaller() {
  return appRouter.createCaller(
    context({
      manager: {
        companyId,
        companyName: fixtureName,
        managerEmail: `ci-inline-manager-${fixtureToken}@example.test`,
      },
    })
  );
}

function leaderCaller() {
  return appRouter.createCaller(
    context({
      processLeader: {
        processLeaderId: leaderAccountId,
        leaderName: `Jefe estándar ${fixtureToken}`,
        leaderEmail: `ci-inline-leader-${fixtureToken}@example.test`,
        processId,
        companyId,
        companyName: fixtureName,
      },
    })
  );
}

async function infoRows(targetCompanyId: number) {
  return db
    .select()
    .from(companyInfo)
    .where(eq(companyInfo.companyId, targetCompanyId))
    .orderBy(companyInfo.id);
}

beforeAll(async () => {
  assertAnnualIntegrationDatabase();
  const connection = await getDb();
  if (!connection) throw new Error("BD TEST local no disponible.");
  db = connection;

  const roleRows = await db
    .select({ id: roles.id, slug: roles.slug })
    .from(roles)
    .where(inArray(roles.slug, ["company_manager", "process_leader"]));
  const managerRoleId = roleRows.find(row => row.slug === "company_manager")?.id;
  const leaderRoleId = roleRows.find(row => row.slug === "process_leader")?.id;
  if (!managerRoleId || !leaderRoleId) throw new Error("Faltan roles canónicos de prueba.");

  for (const identity of ["manager", "leader", "foreign-manager"] as const) {
    const result = await db.insert(accounts).values({
      openId: `ci-inline-${identity}-${fixtureToken}`,
      name: `${identity} ${fixtureName}`,
      email: `ci-inline-${identity}-${fixtureToken}@example.test`,
      status: "active",
    });
    ownAccountIds.push(Number(result[0].insertId));
  }
  const [managerAccountId, createdLeaderAccountId, foreignManagerAccountId] = ownAccountIds;
  leaderAccountId = createdLeaderAccountId;

  for (const [ownerAccountId, suffix] of [
    [managerAccountId, "propia"],
    [foreignManagerAccountId, "ajena"],
  ] as const) {
    const result = await db.insert(companies).values({
      name: `${fixtureName}-${suffix}`,
      ownerAccountId,
      status: "En Proceso",
    });
    ownCompanyIds.push(Number(result[0].insertId));
  }
  [companyId, foreignCompanyId] = ownCompanyIds;
  expect(companyId).toBeGreaterThan(0);
  expect(foreignCompanyId).toBeGreaterThan(0);
  expect(companyId).not.toBe(foreignCompanyId);
  expect(new Set(ownAccountIds).size).toBe(3);

  const processResult = await db.insert(processes).values({
    companyId,
    name: `Proceso fixture inline ${fixtureToken}`,
    processType: "soporte",
  });
  processId = Number(processResult[0].insertId);

  for (const assignment of [
    { accountId: managerAccountId, roleId: managerRoleId, companyId, processId: 0 },
    { accountId: leaderAccountId, roleId: leaderRoleId, companyId, processId },
    { accountId: foreignManagerAccountId, roleId: managerRoleId, companyId: foreignCompanyId, processId: 0 },
  ]) {
    const result = await db.insert(accountRoles).values({ ...assignment, status: "active" });
    ownRoleAssignmentIds.push(Number(result[0].insertId));
  }

  const accessResult = await db.insert(companyManagementAccess).values({
    companyId,
    accountId: leaderAccountId,
    accessLevel: "standard",
  });
  standardAccessId = Number(accessResult[0].insertId);

  await db.insert(companyInfo).values(
    ownCompanyIds.map(id => ({
      companyId: id,
      proposito: `Propósito protegido ${id} ${fixtureToken}`,
      mision: `Misión protegida ${id} ${fixtureToken}`,
      vision: `Visión protegida ${id} ${fixtureToken}`,
      adminAlertEmail: `ci-inline-alert-${fixtureToken}@example.test`,
    }))
  );
  console.info("[companyInfo inline permission] Fixtures propios:", JSON.stringify({
    fixtureToken, accountIds: ownAccountIds, companyIds: ownCompanyIds,
    roleAssignmentIds: ownRoleAssignmentIds, processId, standardAccessId,
  }));
}, 30_000);

afterAll(async () => {
  if (!db) return;
  if (ownCompanyIds.length) {
    await db.delete(companyInfo).where(inArray(companyInfo.companyId, ownCompanyIds));
    // The real annual middleware registers only base-year metadata for our companies.
    await db.delete(annualWorkspaces).where(
      and(inArray(annualWorkspaces.companyId, ownCompanyIds), eq(annualWorkspaces.year, 2026))
    );
  }
  if (standardAccessId) {
    await db.delete(companyManagementAccess).where(eq(companyManagementAccess.id, standardAccessId));
  }
  if (ownRoleAssignmentIds.length) {
    await db.delete(accountRoles).where(inArray(accountRoles.id, ownRoleAssignmentIds));
  }
  if (processId) await db.delete(processes).where(eq(processes.id, processId));
  if (ownCompanyIds.length) await db.delete(companies).where(inArray(companies.id, ownCompanyIds));
  if (ownAccountIds.length) await db.delete(accounts).where(inArray(accounts.id, ownAccountIds));

  if (ownCompanyIds.length) {
    expect(await db.select().from(companyInfo).where(inArray(companyInfo.companyId, ownCompanyIds))).toEqual([]);
    expect(await db.select().from(annualWorkspaces).where(inArray(annualWorkspaces.companyId, ownCompanyIds))).toEqual([]);
    expect(await db.select().from(companyManagementAccess).where(inArray(companyManagementAccess.companyId, ownCompanyIds))).toEqual([]);
    expect(await db.select().from(accountRoles).where(inArray(accountRoles.companyId, ownCompanyIds))).toEqual([]);
    expect(await db.select().from(processes).where(inArray(processes.companyId, ownCompanyIds))).toEqual([]);
    expect(await db.select().from(companies).where(inArray(companies.id, ownCompanyIds))).toEqual([]);
  }
  if (ownAccountIds.length) {
    expect(await db.select().from(accounts).where(inArray(accounts.id, ownAccountIds))).toEqual([]);
  }
  console.info("[companyInfo inline permission] Limpieza propia verificada; sin filas fixture residuales.");
}, 30_000);

describe("appRouter.companyInfo.upsert: permisos inline reales en TEST local", () => {
  it("permite al Gerente actualizar su compañía y persiste propósito, misión y visión", async () => {
    const before = await infoRows(companyId);
    expect(before).toHaveLength(1);
    const content = {
      proposito: `Propósito autorizado por Gerente ${fixtureToken}`,
      mision: `Misión autorizada por Gerente ${fixtureToken}`,
      vision: `Visión autorizada por Gerente ${fixtureToken}`,
    };
    await expect(managerCaller().companyInfo.upsert({ companyId, ...content })).resolves.toMatchObject({
      id: before[0].id,
      companyId,
    });
    const after = await infoRows(companyId);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: before[0].id, companyId, ...content });
    expect(after[0].adminAlertEmail).toBe(before[0].adminAlertEmail);
    await expect(managerCaller().companyInfo.get({ companyId })).resolves.toEqual(after[0]);
  });

  it("deniega al Jefe estándar con FORBIDDEN y conserva íntegra la fila corporativa", async () => {
    const access = await db.select().from(companyManagementAccess).where(eq(companyManagementAccess.id, standardAccessId));
    expect(access).toHaveLength(1);
    expect(access[0]).toMatchObject({ companyId, accountId: leaderAccountId, accessLevel: "standard" });
    const before = await infoRows(companyId);
    expect(before).toHaveLength(1);
    const caller = leaderCaller();
    await expect(caller.companyInfo.get({ companyId })).resolves.toEqual(before[0]);
    await expect(caller.companyInfo.upsert({
      companyId,
      proposito: `Cambio corporativo NO autorizado ${fixtureToken}`,
      mision: `Misión NO autorizada ${fixtureToken}`,
      vision: `Visión NO autorizada ${fixtureToken}`,
    })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Este Jefe de Proceso puede consultar el módulo, pero no modificarlo. El Gerente debe autorizar el permiso de edición para este módulo.",
    });
    expect(await infoRows(companyId)).toEqual(before);
    await expect(caller.companyInfo.get({ companyId })).resolves.toEqual(before[0]);
  });

  it.each(["Gerente", "Jefe estándar"] as const)(
    "deniega al %s la compañía ajena con FORBIDDEN sin cambiar ninguna fila",
    async actor => {
      const ownBefore = await infoRows(companyId);
      const foreignBefore = await infoRows(foreignCompanyId);
      expect(ownBefore).toHaveLength(1);
      expect(foreignBefore).toHaveLength(1);
      const caller = actor === "Gerente" ? managerCaller() : leaderCaller();
      await expect(caller.companyInfo.upsert({
        companyId: foreignCompanyId,
        proposito: `Cambio ajeno NO autorizado por ${actor} ${fixtureToken}`,
        mision: "Misión ajena NO autorizada",
        vision: "Visión ajena NO autorizada",
      })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await infoRows(foreignCompanyId)).toEqual(foreignBefore);
      expect(await infoRows(companyId)).toEqual(ownBefore);
    }
  );
});
