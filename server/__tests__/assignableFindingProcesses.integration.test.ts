import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  accountRoles,
  accounts,
  companies,
  companyManagementAccess,
  inspections,
  linkedCommitments,
  operationalFindings,
  processes,
  roles,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { linkedCommitmentsRouter } from "../routers/linkedCommitments";
import { processMapRouter } from "../routers/processMap";
import { teamAccessRouter } from "../routers/teamAccess";

const testName = `Prueba selector de hallazgos ${Date.now()}`;
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId = 0;
let foreignCompanyId = 0;
let managerAccountId = 0;
let leaderAccountId = 0;
let processLeaderRoleId = 0;
let ownProcessId = 0;
let otherProcessId = 0;
let foreignProcessId = 0;
let findingId = 0;

function context(
  overrides: Partial<Record<"user" | "manager" | "processLeader", unknown>>
) {
  return {
    user: null,
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
    ...overrides,
  } as never;
}

function leaderContext() {
  return context({
    processLeader: {
      processLeaderId: leaderAccountId,
      leaderName: "Coordinador de hallazgos de prueba",
      leaderEmail: "coordinador.hallazgos@example.test",
      processId: ownProcessId,
      companyId,
      companyName: testName,
    },
  });
}

function managerContext() {
  return context({
    manager: {
      companyId,
      companyName: testName,
      managerEmail: "gerente.hallazgos@example.test",
    },
  });
}

beforeAll(async () => {
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db)
    throw new Error("Base local no disponible para la prueba de hallazgos.");

  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.slug, "process_leader"))
    .limit(1);
  if (!role) throw new Error("Rol process_leader no disponible.");
  processLeaderRoleId = role.id;

  const manager = await db.insert(accounts).values({
    openId: `manager-finding-selector-${Date.now()}`,
    name: "Gerente selector de hallazgos",
    email: "gerente.hallazgos@example.test",
    status: "active",
  });
  managerAccountId = Number(manager[0].insertId);
  const leader = await db.insert(accounts).values({
    openId: `leader-finding-selector-${Date.now()}`,
    name: "Coordinador selector de hallazgos",
    email: "coordinador.hallazgos@example.test",
    status: "active",
  });
  leaderAccountId = Number(leader[0].insertId);

  const company = await db.insert(companies).values({
    name: testName,
    ownerAccountId: managerAccountId,
    status: "En Proceso",
  });
  companyId = Number(company[0].insertId);
  const foreignCompany = await db.insert(companies).values({
    name: `${testName} ajena`,
    ownerAccountId: managerAccountId,
    status: "En Proceso",
  });
  foreignCompanyId = Number(foreignCompany[0].insertId);

  const own = await db.insert(processes).values({
    companyId,
    name: "Proceso propio del Coordinador",
    processType: "soporte",
  });
  ownProcessId = Number(own[0].insertId);
  const other = await db.insert(processes).values({
    companyId,
    name: "Proceso responsable alterno",
    processType: "misional",
  });
  otherProcessId = Number(other[0].insertId);
  const foreign = await db.insert(processes).values({
    companyId: foreignCompanyId,
    name: "Proceso de otra empresa",
    processType: "estrategico",
  });
  foreignProcessId = Number(foreign[0].insertId);

  await db.insert(accountRoles).values({
    accountId: leaderAccountId,
    roleId: processLeaderRoleId,
    companyId,
    processId: ownProcessId,
    status: "active",
  });

  const inspection = await db.insert(inspections).values({
    companyId,
    managementSystem: "Inspección sintética para selector",
    orderIndex: 0,
  });
  const inspectionId = Number(inspection[0].insertId);
  const finding = await db.insert(operationalFindings).values({
    companyId,
    sourceType: "inspection",
    sourceId: inspectionId,
    classification: "observation",
    finding: "Hallazgo sintético de selección",
    closureTask: "Asignar al proceso responsable",
    orderIndex: 0,
  });
  findingId = Number(finding[0].insertId);
});

afterAll(async () => {
  if (!db) return;
  const companyIds = [companyId, foreignCompanyId].filter(Boolean);
  if (companyId) {
    await db
      .delete(linkedCommitments)
      .where(eq(linkedCommitments.companyId, companyId));
    await db
      .delete(operationalFindings)
      .where(eq(operationalFindings.companyId, companyId));
    await db.delete(inspections).where(eq(inspections.companyId, companyId));
    await db
      .delete(companyManagementAccess)
      .where(eq(companyManagementAccess.companyId, companyId));
    await db.delete(accountRoles).where(eq(accountRoles.companyId, companyId));
  }
  if (companyIds.length)
    await db.delete(processes).where(inArray(processes.companyId, companyIds));
  if (companyIds.length)
    await db.delete(companies).where(inArray(companies.id, companyIds));
  const accountIds = [managerAccountId, leaderAccountId].filter(Boolean);
  if (accountIds.length)
    await db.delete(accounts).where(inArray(accounts.id, accountIds));
});

describe("Selector de hallazgos por proceso: integración local", () => {
  it("mantiene al Jefe estándar sin acceso al selector ampliado", async () => {
    const commitments = linkedCommitmentsRouter.createCaller(leaderContext());
    await expect(
      commitments.listAssignableFindingProcesses({
        companyId,
        sourceType: "inspection_finding",
        sourceId: findingId,
      })
    ).rejects.toThrow("puede consultar el módulo");
  });

  it("permite al Coordinador seleccionar procesos de su empresa sin abrir su Mapa de Procesos", async () => {
    await teamAccessRouter
      .createCaller(managerContext())
      .setCompanyManagementAccess({
        companyId,
        accountId: leaderAccountId,
        accessLevel: "coordinator",
      });

    const commitments = linkedCommitmentsRouter.createCaller(leaderContext());
    const targets = await commitments.listAssignableFindingProcesses({
      companyId,
      sourceType: "inspection_finding",
      sourceId: findingId,
    });
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ownProcessId }),
        expect.objectContaining({ id: otherProcessId }),
      ])
    );
    expect(targets.some(target => target.id === foreignProcessId)).toBe(false);

    const processMap = processMapRouter.createCaller(leaderContext());
    await expect(processMap.list({ companyId })).resolves.toEqual([
      expect.objectContaining({ id: ownProcessId }),
    ]);
    await expect(processMap.get({ processId: otherProcessId })).rejects.toThrow(
      "No tiene acceso al proceso solicitado"
    );
  });

  it("valida el hallazgo y crea el compromiso para el proceso seleccionado", async () => {
    const commitments = linkedCommitmentsRouter.createCaller(leaderContext());
    await expect(
      commitments.listAssignableFindingProcesses({
        companyId,
        sourceType: "inspection_finding",
        sourceId: findingId + 999999,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      commitments.createLinks({
        companyId,
        sourceType: "inspection_finding",
        sourceId: findingId,
        processIds: [otherProcessId],
      })
    ).resolves.toMatchObject({ created: 1 });

    const links = await db
      .select({ processId: linkedCommitments.processId })
      .from(linkedCommitments)
      .where(
        and(
          eq(linkedCommitments.companyId, companyId),
          eq(linkedCommitments.sourceType, "inspection_finding"),
          eq(linkedCommitments.sourceId, findingId)
        )
      );
    expect(links).toEqual([{ processId: otherProcessId }]);
    await expect(
      commitments.listByProcess({ companyId, processId: otherProcessId })
    ).rejects.toThrow("solo puede gestionar los compromisos de su proceso");
  });
});
