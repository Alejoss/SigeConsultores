import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  accounts,
  accountRoles,
  changeManagementActions,
  changeManagementEvents,
  changeManagementImpacts,
  changeManagementIndicators,
  changeManagementRecords,
  changeManagementScopeLinks,
  changeManagementSuggestions,
  companies,
  linkedCommitments,
  linkedCommitmentEvidence,
  processes,
  roles,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { changeManagementRouter } from "../routers/changeManagement";
import { linkedCommitmentsRouter } from "../routers/linkedCommitments";

const testName = `Prueba Gestión de Cambios ${Date.now()}`;
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId = 0;
let sourceProcessId = 0;
let targetProcessId = 0;
let changeId = 0;
let actionId = 0;
let linkedCommitmentId = 0;
let managerAccountId = 0;

function managerContext() {
  return {
    user: null,
    manager: {
      companyId,
      companyName: testName,
      managerEmail: "gerente.cambios@example.test",
    },
    processLeader: null,
    req: {} as never,
    res: {} as never,
  } as never;
}

function sourceLeaderContext() {
  return {
    user: null,
    manager: null,
    processLeader: {
      processLeaderId: 4441,
      leaderName: "Jefe sugerente de prueba",
      leaderEmail: "jefe.sugerente@example.test",
      processId: sourceProcessId,
      companyId,
      companyName: testName,
    },
    req: {} as never,
    res: {} as never,
  } as never;
}

function targetLeaderContext() {
  return {
    user: null,
    manager: null,
    processLeader: {
      processLeaderId: 4442,
      leaderName: "Jefe ejecutor de prueba",
      leaderEmail: "jefe.ejecutor@example.test",
      processId: targetProcessId,
      companyId,
      companyName: testName,
    },
    req: {} as never,
    res: {} as never,
  } as never;
}

beforeAll(async () => {
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db) throw new Error("Base local no disponible para prueba de Gestión de Cambios.");
  const company = await db.insert(companies).values({
    name: testName,
    ownerAccountId: 1,
    status: "En Proceso",
  });
  companyId = Number(company[0].insertId);
  const managerAccount = await db.insert(accounts).values({
    openId: `change-manager-${Date.now()}`,
    name: "Gerente de cambios de prueba",
    email: `gerente.cambios.${Date.now()}@example.test`,
    loginMethod: "test",
  });
  managerAccountId = Number(managerAccount[0].insertId);
  const [managerRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.slug, "company_manager"))
    .limit(1);
  if (!managerRole) throw new Error("No existe el rol company_manager para la prueba.");
  await db.insert(accountRoles).values({
    accountId: managerAccountId,
    roleId: managerRole.id,
    companyId,
    processId: 0,
    status: "active",
  });
  const source = await db.insert(processes).values({
    companyId,
    name: "Proceso que sugiere",
    processType: "estrategico",
  });
  sourceProcessId = Number(source[0].insertId);
  const target = await db.insert(processes).values({
    companyId,
    name: "Proceso que ejecuta",
    processType: "soporte",
  });
  targetProcessId = Number(target[0].insertId);
});

afterAll(async () => {
  if (!db || !companyId) return;
  await db.delete(linkedCommitmentEvidence).where(eq(linkedCommitmentEvidence.companyId, companyId));
  await db.delete(linkedCommitments).where(eq(linkedCommitments.companyId, companyId));
  await db.delete(changeManagementEvents).where(eq(changeManagementEvents.companyId, companyId));
  await db.delete(changeManagementIndicators).where(eq(changeManagementIndicators.companyId, companyId));
  await db.delete(changeManagementActions).where(eq(changeManagementActions.companyId, companyId));
  await db.delete(changeManagementImpacts).where(eq(changeManagementImpacts.changeId, changeId));
  await db.delete(changeManagementScopeLinks).where(eq(changeManagementScopeLinks.companyId, companyId));
  await db.delete(changeManagementSuggestions).where(eq(changeManagementSuggestions.companyId, companyId));
  await db.delete(changeManagementRecords).where(eq(changeManagementRecords.companyId, companyId));
  if (managerAccountId) await db.delete(accountRoles).where(eq(accountRoles.accountId, managerAccountId));
  await db.delete(processes).where(eq(processes.companyId, companyId));
  await db.delete(companies).where(eq(companies.id, companyId));
  if (managerAccountId) await db.delete(accounts).where(eq(accounts.id, managerAccountId));
});

describe("Gestión de Cambios: integración local", () => {
  it("permite al Jefe sugerir pero no abrir un expediente corporativo", async () => {
    const leader = changeManagementRouter.createCaller(sourceLeaderContext());
    await expect(
      leader.create({
        companyId,
        title: "Cambio que el Jefe no debe crear directamente",
        origin: "internal_improvement",
        impactLevel: "low",
      })
    ).rejects.toThrow("puede consultar el módulo");

    await expect(
      leader.suggest({
        companyId,
        title: "Sugerencia de proceso",
        rationale: "Revisar una oportunidad detectada en la operación.",
      })
    ).resolves.toEqual(expect.objectContaining({ id: expect.any(Number) }));
  });

  it("crea un expediente auditable, vincula una acción y la refleja en el proceso responsable", async () => {
    const manager = changeManagementRouter.createCaller(managerContext());
    const references = await manager.getReferenceOptions({ companyId });
    expect(references.responsibles.some(responsible => responsible.accountId === managerAccountId)).toBe(true);
    const created = await manager.create({
      companyId,
      title: "Implementar control de cambios de prueba",
      description: "Prueba temporal de trazabilidad.",
      reason: "Oportunidad de mejora detectada.",
      objective: "Validar la ruta completa del cambio.",
      expectedResult: "Acción cerrada con evidencia desde el proceso responsable.",
      origin: "internal_improvement",
      impactLevel: "medium",
      responsibleProcessId: targetProcessId,
      targetCompletionDate: "2026-12-15",
    });
    changeId = created.id;

    const [createdRecord] = await db.select().from(changeManagementRecords).where(eq(changeManagementRecords.id, changeId));
    expect(createdRecord.responsibleProcessId).toBe(targetProcessId);
    expect(createdRecord.responsibleName).toBe("Proceso que ejecuta");
    expect(createdRecord.responsibleAccountId).toBeNull();

    await manager.addScopeLinks({
      companyId,
      changeId,
      links: [{ linkType: "process", referenceId: targetProcessId }],
    });
    await manager.upsertImpacts({
      companyId,
      changeId,
      impacts: [{ category: "basc_control_security", impactLevel: "high", notes: "Revisión de control y seguridad." }],
    });
    const action = await manager.createAction({
      companyId,
      changeId,
      action: "Completar evidencia del cambio desde el proceso responsable",
      responsibleProcessId: targetProcessId,
      plannedDate: "2026-11-10",
      evidenceExpected: "Registro de validación de prueba",
    });
    actionId = action.id;

    await manager.addIndicator({
      companyId,
      changeId,
      name: "Porcentaje de validación completada",
      unit: "%",
      baselineValue: "0",
      targetValue: "100",
      achievedValue: "100",
      measurementDate: "2026-11-11",
    });

    const [linked] = await db.select().from(linkedCommitments).where(
      and(
        eq(linkedCommitments.companyId, companyId),
        eq(linkedCommitments.sourceType, "change_action"),
        eq(linkedCommitments.sourceId, actionId),
        eq(linkedCommitments.processId, targetProcessId)
      )
    );
    expect(linked).toBeTruthy();
    linkedCommitmentId = linked.id;

    const list = await manager.list({ companyId });
    const record = list.find(item => item.id === changeId);
    expect(record?.scope).toContainEqual(expect.objectContaining({ titleSnapshot: "Proceso que ejecuta" }));
    expect(record?.impacts).toContainEqual(expect.objectContaining({ category: "basc_control_security" }));
    expect(record?.events.length).toBeGreaterThanOrEqual(4);
  });

  it("sincroniza al expediente el cierre realizado por el proceso responsable", async () => {
    const manager = changeManagementRouter.createCaller(managerContext());
    await expect(
      manager.updateAction({
        companyId,
        id: actionId,
        status: "completed",
      })
    ).rejects.toThrow("debe registrarse desde Compromisos vinculados");

    const processCommitments = linkedCommitmentsRouter.createCaller(targetLeaderContext());
    await expect(
      processCommitments.updateProgress({
        id: linkedCommitmentId,
        companyId,
        status: "completed",
      })
    ).rejects.toThrow("requiere evidencia");
    await expect(
      processCommitments.delete({ id: linkedCommitmentId, companyId })
    ).rejects.toThrow("conservan su vínculo");

    await db.insert(linkedCommitmentEvidence).values({
      linkedCommitmentId,
      companyId,
      fileName: "evidencia-cambio-prueba.pdf",
      fileKey: `tests/change-management/${linkedCommitmentId}.pdf`,
      fileUrl: "https://example.test/evidencia-cambio-prueba.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 12,
    });
    await processCommitments.updateProgress({
      id: linkedCommitmentId,
      companyId,
      status: "completed",
      notes: "Evidencia revisada en prueba local.",
    });

    const [action] = await db.select().from(changeManagementActions).where(eq(changeManagementActions.id, actionId));
    expect(action.status).toBe("completed");
    expect(action.completedAt).toBeTruthy();

    await manager.transition({ companyId, id: changeId, status: "under_evaluation" });
    await manager.transition({ companyId, id: changeId, status: "approved", note: "Gerencia aprueba el plan temporal de prueba." });
    await manager.transition({ companyId, id: changeId, status: "in_execution" });
    await manager.transition({ companyId, id: changeId, status: "implemented_pending_verification" });
    await manager.update({
      companyId,
      id: changeId,
      verificationResult: "effective",
      verificationNotes: "La evidencia y el indicador de prueba confirman la efectividad.",
      verificationDate: "2026-11-12",
    });
    await manager.transition({ companyId, id: changeId, status: "closed", note: "Gerencia verificó la eficacia del cambio y autorizó su cierre." });

    const [closed] = await db.select().from(changeManagementRecords).where(eq(changeManagementRecords.id, changeId));
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).toBeTruthy();
  });
});
