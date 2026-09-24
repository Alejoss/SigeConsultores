import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  accessAuditLog,
  accounts,
  accountRoles,
  companies,
  companyInfo,
  companyManagementAccess,
  companyTrainings,
  managementPrograms,
  policies,
  policyObjectives,
  processRiskMatrices,
  processes,
  roles,
  trainingBackups,
  trainingSchedules,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  assertCompanyManagementAccess,
  assertCompanyPersonnelManagementAccess,
} from "../_core/companyPermissions";
import { managementProgramsRouter } from "../routers/managementPrograms";
import { companyInfoRouter } from "../routers/companyInfo";
import { policiesRouter } from "../routers/policies";
import { processActivitiesRouter } from "../routers/processActivities";
import { processesRouter } from "../routers/processes";
import { processRiskMatrixRouter } from "../routers/processRiskMatrix";
import { teamAccessRouter } from "../routers/teamAccess";
import { appRouter } from "../routers";

const testName = `Prueba permisos Coordinador ${Date.now()}`;
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId = 0;
let processId = 0;
let otherProcessId = 0;
let managerAccountId = 0;
let leaderAccountId = 0;
let processLeaderRoleId = 0;
let trainingId = 0;
let trainingBackupId = 0;
let policyId = 0;
let legacyPolicyObjectiveId = 0;

function context(overrides: Partial<Record<"user" | "manager" | "processLeader", unknown>>) {
  return {
    user: null,
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
    ...overrides,
  } as never;
}

function managerCaller() {
  return teamAccessRouter.createCaller(
    context({
      manager: {
        companyId,
        companyName: testName,
        managerEmail: "gerente.coordinador@example.test",
      },
    })
  );
}

function leaderContext() {
  return context({
    processLeader: {
      processLeaderId: leaderAccountId,
      leaderName: "Jefe Coordinador de Prueba",
      leaderEmail: "jefe.coordinador@example.test",
      processId,
      companyId,
      companyName: testName,
    },
  });
}

beforeAll(async () => {
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db) throw new Error("Base local no disponible para prueba de Coordinador.");

  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.slug, "process_leader"))
    .limit(1);
  if (!role) throw new Error("Rol process_leader no disponible.");
  processLeaderRoleId = role.id;

  const manager = await db.insert(accounts).values({
    openId: `manager-coordinator-${Date.now()}`,
    name: "Gerente Coordinador de Prueba",
    email: "gerente.coordinador@example.test",
    status: "active",
  });
  managerAccountId = Number(manager[0].insertId);
  const leader = await db.insert(accounts).values({
    openId: `leader-coordinator-${Date.now()}`,
    name: "Jefe Coordinador de Prueba",
    email: "jefe.coordinador@example.test",
    status: "active",
  });
  leaderAccountId = Number(leader[0].insertId);

  const company = await db.insert(companies).values({
    name: testName,
    ownerAccountId: managerAccountId,
    status: "En Proceso",
  });
  companyId = Number(company[0].insertId);
  const policy = await db.insert(policies).values({
    companyId,
    versionNo: "1.0",
    policyText: "Política de prueba para Objetivos.",
  });
  policyId = Number(policy[0].insertId);
  const legacyObjective = await db.insert(policyObjectives).values({
    // Dato histórico: versiones anteriores guardaban el companyId en policyId.
    policyId: companyId,
    objective: "Objetivo histórico de Política",
    description: "Debe seguir disponible sin modificarlo.",
    orderIndex: 0,
  });
  legacyPolicyObjectiveId = Number(legacyObjective[0].insertId);
  const process = await db.insert(processes).values({
    companyId,
    name: "Proceso propio de Coordinador",
    processType: "soporte",
  });
  processId = Number(process[0].insertId);
  const other = await db.insert(processes).values({
    companyId,
    name: "Proceso ajeno de Coordinador",
    processType: "misional",
  });
  otherProcessId = Number(other[0].insertId);
  await db.insert(accountRoles).values({
    accountId: leaderAccountId,
    roleId: processLeaderRoleId,
    companyId,
    processId,
    status: "active",
  });

  const training = await db.insert(companyTrainings).values({
    companyId,
    name: "Capacitación protegida de prueba",
  });
  trainingId = Number(training[0].insertId);
  const backup = await db.insert(trainingBackups).values({
    companyId,
    trainingId,
    fileName: "respaldo-protegido.pdf",
    fileUrl: "https://example.test/respaldo-protegido.pdf",
    fileKey: "tests/respaldo-protegido.pdf",
  });
  trainingBackupId = Number(backup[0].insertId);
});

afterAll(async () => {
  if (!db) return;
  if (companyId) {
    await db.delete(policyObjectives).where(
      or(
        eq(policyObjectives.policyId, policyId),
        eq(policyObjectives.policyId, companyId)
      )
    );
    await db.delete(trainingBackups).where(eq(trainingBackups.companyId, companyId));
    await db.delete(trainingSchedules).where(eq(trainingSchedules.companyId, companyId));
    await db.delete(companyTrainings).where(eq(companyTrainings.companyId, companyId));
    await db.delete(policies).where(eq(policies.companyId, companyId));
    await db.delete(companyInfo).where(eq(companyInfo.companyId, companyId));
    await db.delete(managementPrograms).where(eq(managementPrograms.companyId, companyId));
    await db.delete(accessAuditLog).where(eq(accessAuditLog.companyId, companyId));
    await db.delete(companyManagementAccess).where(eq(companyManagementAccess.companyId, companyId));
    await db.delete(accountRoles).where(eq(accountRoles.companyId, companyId));
  }
  if (processId || otherProcessId) {
    await db.delete(processRiskMatrices).where(inArray(processRiskMatrices.processId, [processId, otherProcessId].filter(Boolean)));
    await db.delete(processes).where(
      eq(processes.companyId, companyId)
    );
  }
  if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
  const accountIds = [managerAccountId, leaderAccountId].filter(Boolean);
  if (accountIds.length) await db.delete(accounts).where(inArray(accounts.id, accountIds));
});

describe("Coordinador de empresa: integración local", () => {
  it("mantiene al Jefe estándar en modo consulta para módulos corporativos", async () => {
    await expect(
      assertCompanyManagementAccess(leaderContext(), companyId)
    ).rejects.toThrow("puede consultar el módulo");

    const leaderPrograms = managementProgramsRouter.createCaller(leaderContext());
    await expect(
      leaderPrograms.create({
        companyId,
        programName: "Programa no autorizado",
        managementSystem: "Calidad",
      })
    ).rejects.toThrow("puede consultar el módulo");

    const leaderCompanyInfo = companyInfoRouter.createCaller(leaderContext());
    await expect(
      leaderCompanyInfo.upsert({
        companyId,
        proposito: "Cambio corporativo no autorizado",
      })
    ).rejects.toThrow("puede consultar el módulo");

    const leaderPolicies = policiesRouter.createCaller(leaderContext());
    await expect(
      leaderPolicies.upsert({
        companyId,
        policyText: "Política no autorizada",
      })
    ).rejects.toThrow("puede consultar el módulo");

    const corporateModules = appRouter.createCaller(leaderContext());
    await expect(
      corporateModules.policyObjectives.list({ policyId })
    ).resolves.toContainEqual(
      expect.objectContaining({ id: legacyPolicyObjectiveId })
    );
    await expect(
      corporateModules.policyObjectives.create({
        policyId,
        objective: "Objetivo no autorizado",
        orderIndex: 1,
      })
    ).rejects.toThrow("puede consultar el módulo");

    const trainings = corporateModules;
    await expect(trainings.companyTrainings.list({ companyId })).resolves.toHaveLength(1);
    await expect(
      trainings.companyTrainings.create({
        companyId,
        name: "Capacitación no autorizada",
      })
    ).rejects.toThrow("puede consultar el módulo");
    await expect(
      trainings.companyTrainings.update({
        trainingId,
        name: "Cambio no autorizado",
      })
    ).rejects.toThrow("puede consultar el módulo");
    await expect(
      trainings.companyTrainings.delete({ trainingId })
    ).rejects.toThrow("puede consultar el módulo");
    await expect(
      trainings.companyTrainings.clearByCompany({ companyId })
    ).rejects.toThrow("puede consultar el módulo");
    await expect(
      trainings.companyTrainings.importBulk({
        companyId,
        rows: [{ name: "Importación no autorizada" }],
      })
    ).rejects.toThrow("puede consultar el módulo");
    await expect(
      trainings.trainingSchedules.upsert({
        companyId,
        year: 2026,
        fileName: "cronograma.pdf",
        fileUrl: "https://example.test/cronograma.pdf",
        fileKey: "tests/cronograma.pdf",
      })
    ).rejects.toThrow("puede consultar el módulo");
    await expect(
      trainings.trainingBackups.add({
        companyId,
        trainingId,
        fileName: "respaldo-no-autorizado.pdf",
        fileUrl: "https://example.test/respaldo-no-autorizado.pdf",
        fileKey: "tests/respaldo-no-autorizado.pdf",
      })
    ).rejects.toThrow("puede consultar el módulo");
    await expect(
      trainings.trainingBackups.list({ trainingId })
    ).resolves.toHaveLength(1);
    await expect(
      trainings.trainingBackups.delete({ backupId: trainingBackupId })
    ).rejects.toThrow("puede consultar el módulo");
  });

  it("permite al Gerente autorizar y revocar una coordinación de forma trazable", async () => {
    const grant = await managerCaller().setCompanyManagementAccess({
      companyId,
      accountId: leaderAccountId,
      accessLevel: "coordinator",
    });
    expect(grant.accessLevel).toBe("coordinator");
    await expect(assertCompanyManagementAccess(leaderContext(), companyId)).resolves.toBeUndefined();

    const [access] = await db
      .select()
      .from(companyManagementAccess)
      .where(
        and(
          eq(companyManagementAccess.companyId, companyId),
          eq(companyManagementAccess.accountId, leaderAccountId)
        )
      )
      .limit(1);
    expect(access?.accessLevel).toBe("coordinator");

    const [audit] = await db
      .select({ eventType: accessAuditLog.eventType })
      .from(accessAuditLog)
      .where(
        and(
          eq(accessAuditLog.companyId, companyId),
          eq(accessAuditLog.accountId, leaderAccountId),
          eq(accessAuditLog.eventType, "company_management_access_granted")
        )
      )
      .limit(1);
    expect(audit?.eventType).toBe("company_management_access_granted");
  });

  it("permite al Coordinador editar un módulo corporativo sin abrir procesos ajenos", async () => {
    const leaderPrograms = managementProgramsRouter.createCaller(leaderContext());
    const program = await leaderPrograms.create({
      companyId,
      programName: "Programa gestionado por Coordinador",
      managementSystem: "Calidad",
    });
    expect(program?.programName).toBe("Programa gestionado por Coordinador");

    const leaderCompanyInfo = companyInfoRouter.createCaller(leaderContext());
    await expect(
      leaderCompanyInfo.upsert({
        companyId,
        proposito: "Propósito actualizado por Coordinador",
      })
    ).resolves.toEqual({ success: true });

    const leaderPolicies = policiesRouter.createCaller(leaderContext());
    await expect(
      leaderPolicies.upsert({
        companyId,
        policyText: "Política actualizada por Coordinador",
      })
    ).resolves.toMatchObject({ success: true });

    const corporateModules = appRouter.createCaller(leaderContext());
    await expect(
      corporateModules.policyObjectives.update({
        id: legacyPolicyObjectiveId,
        objective: "Objetivo histórico actualizado por Coordinador",
        description: "La compatibilidad conserva el objetivo histórico.",
      })
    ).resolves.toEqual({ success: true });
    await expect(
      corporateModules.policyObjectives.create({
        policyId,
        objective: "Objetivo creado con la Política real",
        orderIndex: 1,
      })
    ).resolves.toEqual({ success: true });
    const policyObjectivesAfterCreate = await corporateModules.policyObjectives.list({ policyId });
    const createdPolicyObjective = policyObjectivesAfterCreate.find(
      objective => objective.objective === "Objetivo creado con la Política real"
    );
    expect(createdPolicyObjective).toBeDefined();
    await expect(
      corporateModules.policyObjectives.delete({ id: createdPolicyObjective!.id })
    ).resolves.toEqual({ success: true });

    const trainings = corporateModules;
    await expect(
      trainings.companyTrainings.update({
        trainingId,
        name: "Capacitación actualizada por Coordinador",
      })
    ).resolves.toEqual({ success: true });
    await expect(
      trainings.companyTrainings.create({
        companyId,
        name: "Capacitación creada por Coordinador",
      })
    ).resolves.toEqual({ success: true });
    await expect(
      trainings.companyTrainings.importBulk({
        companyId,
        rows: [{ name: "Capacitación importada por Coordinador" }],
      })
    ).resolves.toMatchObject({ inserted: 1, updated: 0 });
    await expect(
      trainings.trainingBackups.add({
        companyId,
        trainingId,
        fileName: "respaldo-del-coordinador.pdf",
        fileUrl: "https://example.test/respaldo-del-coordinador.pdf",
        fileKey: "tests/respaldo-del-coordinador.pdf",
      })
    ).resolves.toEqual({ success: true });
    await expect(
      trainings.trainingBackups.delete({ backupId: trainingBackupId })
    ).resolves.toEqual({ success: true });
    await expect(
      trainings.trainingSchedules.upsert({
        companyId,
        year: 2026,
        fileName: "cronograma-del-coordinador.pdf",
        fileUrl: "https://example.test/cronograma-del-coordinador.pdf",
        fileKey: "tests/cronograma-del-coordinador.pdf",
      })
    ).resolves.toEqual({ success: true });
    await expect(
      trainings.trainingSchedules.delete({ companyId })
    ).resolves.toEqual({ success: true });

    const activities = processActivitiesRouter.createCaller(leaderContext());
    await expect(activities.list({ processId: otherProcessId })).rejects.toThrow("No tiene acceso");
    await expect(
      teamAccessRouter.createCaller(leaderContext()).setCompanyManagementAccess({
        companyId,
        accountId: leaderAccountId,
        accessLevel: "standard",
      })
    ).rejects.toThrow("Solo el Gerente");
  });

  it("mantiene Nómina reservada al Gerente y protege los registros de otros procesos", async () => {
    expect(() =>
      assertCompanyPersonnelManagementAccess(leaderContext(), companyId)
    ).toThrow("Solo el Gerente");

    const riskCaller = processRiskMatrixRouter.createCaller(leaderContext());
    await expect(
      riskCaller.create({
        processId: otherProcessId,
        description: "Riesgo de otro proceso",
      })
    ).rejects.toThrow("No tiene acceso");

    await expect(
      riskCaller.create({
        processId,
        description: "Riesgo del proceso propio",
      })
    ).resolves.toMatchObject({ success: true });

    const alternateProcesses = processesRouter.createCaller(leaderContext());
    await expect(
      alternateProcesses.create({
        companyId,
        name: "Proceso no autorizado",
        processType: "soporte",
      })
    ).rejects.toThrow("Solo el Gerente");
    await expect(
      alternateProcesses.update({
        id: processId,
        name: "Cambio de estructura no autorizado",
        processType: "soporte",
      })
    ).rejects.toThrow("Solo el Gerente");
  });

  it("revoca la coordinación sin afectar el proceso propio", async () => {
    const revoke = await managerCaller().setCompanyManagementAccess({
      companyId,
      accountId: leaderAccountId,
      accessLevel: "standard",
    });
    expect(revoke.accessLevel).toBe("standard");
    await expect(
      assertCompanyManagementAccess(leaderContext(), companyId)
    ).rejects.toThrow("puede consultar el módulo");

    const activities = processActivitiesRouter.createCaller(leaderContext());
    await expect(activities.list({ processId })).resolves.toEqual([]);
  });
});
