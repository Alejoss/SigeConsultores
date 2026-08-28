import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  companies,
  companyCompliances,
  linkedCommitmentEvidence,
  linkedCommitments,
  managementPrograms,
  managementSystemChecklistActions,
  managementSystemChecklistItems,
  managementSystems,
  processes,
  programActions,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { getConsolidatedScheduleActivities } from "../lib/consolidatedScheduleActivities";
import { linkedCommitmentsRouter } from "../routers/linkedCommitments";
import { managementProgramsRouter } from "../routers/managementPrograms";
import { companyCompliancesRouter } from "../routers/companyCompliances";

const testName = `Prueba compromisos vinculados ${Date.now()}`;
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId = 0;
let processOneId = 0;
let processTwoId = 0;
let checklistActionId = 0;
let checklistItemId = 0;
let programActionId = 0;
let programId = 0;
let complianceId = 0;

function managerCaller() {
  return linkedCommitmentsRouter.createCaller({
    user: { role: "admin" },
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
  } as never);
}

function complianceManagerCaller() {
  return companyCompliancesRouter.createCaller({
    user: { role: "admin" },
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
  } as never);
}

function programManagerCaller() {
  return managementProgramsRouter.createCaller({
    user: { role: "admin" },
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
  } as never);
}

function leaderCaller(processId: number) {
  return linkedCommitmentsRouter.createCaller({
    user: null,
    manager: null,
    processLeader: {
      processLeaderId: 1,
      leaderName: "Jefe de prueba",
      leaderEmail: "pruebas@example.com",
      processId,
      companyId,
      companyName: testName,
    },
    req: {} as never,
    res: {} as never,
  } as never);
}

beforeAll(async () => {
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db)
    throw new Error(
      "La base local no está disponible para pruebas de integración."
    );

  const company = await db.insert(companies).values({
    name: testName,
    description:
      "Datos de prueba autolimpiables; no pertenecen a Masa Viva ni Agrogana.",
    ownerAccountId: 1,
    status: "En Proceso",
  });
  companyId = Number(company[0].insertId);
  const processOne = await db
    .insert(processes)
    .values({
      companyId,
      name: "Proceso de prueba uno",
      processType: "misional",
    });
  const processTwo = await db
    .insert(processes)
    .values({
      companyId,
      name: "Proceso de prueba dos",
      processType: "soporte",
    });
  processOneId = Number(processOne[0].insertId);
  processTwoId = Number(processTwo[0].insertId);

  const system = await db
    .insert(managementSystems)
    .values({
      companyId,
      systemName: "Sistema de prueba",
      certification: "ISO de prueba",
      orderIndex: 0,
    });
  const managementSystemId = Number(system[0].insertId);
  const item = await db.insert(managementSystemChecklistItems).values({
    managementSystemId,
    companyId,
    importKey: `test-${Date.now()}`,
    standardName: "Estándar de prueba",
    verificationMode: "ambas",
    applicable: true,
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validUntil: new Date("2026-12-31T00:00:00.000Z"),
    orderIndex: 0,
  });
  checklistItemId = Number(item[0].insertId);
  const checklistAction = await db
    .insert(managementSystemChecklistActions)
    .values({
      checklistItemId,
      action: "Acción de checklist de prueba",
      implementationDate: new Date("2026-10-20T00:00:00.000Z"),
      orderIndex: 0,
    });
  checklistActionId = Number(checklistAction[0].insertId);

  const program = await db
    .insert(managementPrograms)
    .values({
      companyId,
      programName: "Programa de prueba",
      managementSystem: "Calidad",
      plannedActions: 0,
      completedActions: 0,
    });
  programId = Number(program[0].insertId);
  const programAction = await db
    .insert(programActions)
    .values({
      companyId,
      programId,
      action: "Acción de programa de prueba",
      implementationDate: new Date("2026-11-15T00:00:00.000Z"),
      orderIndex: 0,
    });
  programActionId = Number(programAction[0].insertId);

  const compliance = await db.insert(companyCompliances).values({
    companyId,
    requirement: "Cumplimiento de prueba",
    obligationType: "Legal",
    evaluationMode: "vigencia",
    completed: "NO",
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validUntil: new Date("2026-12-31T00:00:00.000Z"),
  });
  complianceId = Number(compliance[0].insertId);
});

afterAll(async () => {
  if (!db || !companyId) return;
  await db
    .delete(linkedCommitmentEvidence)
    .where(eq(linkedCommitmentEvidence.companyId, companyId));
  await db
    .delete(linkedCommitments)
    .where(eq(linkedCommitments.companyId, companyId));
  await db
    .delete(managementSystemChecklistActions)
    .where(
      eq(managementSystemChecklistActions.checklistItemId, checklistItemId)
    );
  await db
    .delete(managementSystemChecklistItems)
    .where(eq(managementSystemChecklistItems.companyId, companyId));
  await db
    .delete(programActions)
    .where(eq(programActions.companyId, companyId));
  await db
    .delete(managementPrograms)
    .where(eq(managementPrograms.companyId, companyId));
  await db
    .delete(companyCompliances)
    .where(eq(companyCompliances.companyId, companyId));
  await db
    .delete(managementSystems)
    .where(eq(managementSystems.companyId, companyId));
  await db.delete(processes).where(eq(processes.companyId, companyId));
  await db.delete(companies).where(eq(companies.id, companyId));
});

describe("Compromisos vinculados: integración local", () => {
  it("solo completa una acción de checklist cuando todos los procesos vinculados cumplen", async () => {
    const manager = managerCaller();
    const created = await manager.createLinks({
      companyId,
      sourceType: "checklist_action",
      sourceId: checklistActionId,
      processIds: [processOneId, processTwoId],
    });
    expect(created.created).toBe(2);

    const first = await db
      .select()
      .from(linkedCommitments)
      .where(
        and(
          eq(linkedCommitments.companyId, companyId),
          eq(linkedCommitments.sourceType, "checklist_action"),
          eq(linkedCommitments.processId, processOneId)
        )
      );
    const second = await db
      .select()
      .from(linkedCommitments)
      .where(
        and(
          eq(linkedCommitments.companyId, companyId),
          eq(linkedCommitments.sourceType, "checklist_action"),
          eq(linkedCommitments.processId, processTwoId)
        )
      );

    await leaderCaller(processOneId).updateProgress({
      id: first[0].id,
      companyId,
      status: "completed",
    });
    let [sourceAction] = await db
      .select()
      .from(managementSystemChecklistActions)
      .where(eq(managementSystemChecklistActions.id, checklistActionId));
    expect(sourceAction.completed).toBe(false);

    await leaderCaller(processTwoId).updateProgress({
      id: second[0].id,
      companyId,
      status: "completed",
    });
    [sourceAction] = await db
      .select()
      .from(managementSystemChecklistActions)
      .where(eq(managementSystemChecklistActions.id, checklistActionId));
    expect(sourceAction.completed).toBe(true);

    const schedule = await getConsolidatedScheduleActivities(processOneId);
    expect(
      schedule.some(
        item =>
          item.id === `linked-commitment-${first[0].id}` &&
          item.type === "linked_commitment"
      )
    ).toBe(true);
  });

  it("impide que un Jefe consulte los compromisos de otro proceso", async () => {
    await expect(
      leaderCaller(processOneId).listByProcess({
        companyId,
        processId: processTwoId,
      })
    ).rejects.toThrow("solo puede gestionar los compromisos de su proceso");
  });

  it("renueva una vigencia de checklist y usa la fecha de vencimiento más conservadora", async () => {
    const manager = managerCaller();
    await manager.createLinks({
      companyId,
      sourceType: "checklist_vigency",
      sourceId: checklistItemId,
      processIds: [processOneId, processTwoId],
    });
    const links = await db
      .select()
      .from(linkedCommitments)
      .where(
        and(
          eq(linkedCommitments.companyId, companyId),
          eq(linkedCommitments.sourceType, "checklist_vigency")
        )
      );
    const one = links.find(link => link.processId === processOneId)!;
    const two = links.find(link => link.processId === processTwoId)!;

    await leaderCaller(processOneId).updateProgress({
      id: one.id,
      companyId,
      renewedValidFrom: "2027-01-01",
      renewedValidUntil: "2027-12-31",
      status: "completed",
    });
    await leaderCaller(processTwoId).updateProgress({
      id: two.id,
      companyId,
      renewedValidFrom: "2027-02-01",
      renewedValidUntil: "2027-10-31",
      status: "completed",
    });

    const [item] = await db
      .select()
      .from(managementSystemChecklistItems)
      .where(eq(managementSystemChecklistItems.id, checklistItemId));
    expect(new Date(item.validFrom!).toISOString().slice(0, 10)).toBe(
      "2027-02-01"
    );
    expect(new Date(item.validUntil!).toISOString().slice(0, 10)).toBe(
      "2027-10-31"
    );
  });

  it("sincroniza una acción de Programa y crea actividades propias visibles en el Cronograma", async () => {
    const manager = managerCaller();
    await manager.createLinks({
      companyId,
      sourceType: "program_action",
      sourceId: programActionId,
      processIds: [processOneId, processTwoId],
    });
    const programLinks = await db
      .select()
      .from(linkedCommitments)
      .where(
        and(
          eq(linkedCommitments.companyId, companyId),
          eq(linkedCommitments.sourceType, "program_action")
        )
      );
    await leaderCaller(processOneId).updateProgress({
      id: programLinks.find(link => link.processId === processOneId)!.id,
      companyId,
      status: "completed",
    });
    await leaderCaller(processTwoId).updateProgress({
      id: programLinks.find(link => link.processId === processTwoId)!.id,
      companyId,
      status: "completed",
    });
    const [programAction] = await db
      .select()
      .from(programActions)
      .where(eq(programActions.id, programActionId));
    const [program] = await db
      .select()
      .from(managementPrograms)
      .where(eq(managementPrograms.id, programId));
    expect(programAction.completed).toBe(true);
    expect(program.completedActions).toBe(1);

    const own = await leaderCaller(processOneId).createOwn({
      companyId,
      processId: processOneId,
      title: "Actividad propia de prueba",
      dueDate: "2026-12-20",
    });
    const schedule = await getConsolidatedScheduleActivities(processOneId);
    expect(
      schedule.some(
        item =>
          item.id === `linked-commitment-${own.id}` &&
          item.element === "Planificación propia"
      )
    ).toBe(true);
  });

  it("importa una planificación de Programa de forma incremental sin duplicar acciones", async () => {
    const manager = programManagerCaller();
    const initial = await manager.importActions({
      companyId,
      programId,
      items: [
        {
          action: "Acción importada desde Excel",
          responsible: "Responsable inicial",
          implementationDate: "2026-09-30",
          completed: false,
        },
      ],
    });
    expect(initial).toMatchObject({ created: 1, updated: 0 });

    const updated = await manager.importActions({
      companyId,
      programId,
      items: [
        {
          action: "Acción importada desde Excel",
          responsible: "Responsable actualizado",
          implementationDate: "2026-09-30",
          completed: true,
        },
      ],
    });
    expect(updated).toMatchObject({ created: 0, updated: 1 });

    const imported = await db
      .select()
      .from(programActions)
      .where(
        and(
          eq(programActions.companyId, companyId),
          eq(programActions.programId, programId),
          eq(
            programActions.importKey,
            "accion importada desde excel|2026-09-30"
          )
        )
      );
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({
      responsible: "Responsable actualizado",
      completed: true,
    });
  });

  it("sincroniza Cumplimientos empresariales por vigencia cuando todos los procesos la renuevan", async () => {
    const manager = managerCaller();
    await manager.createLinks({
      companyId,
      sourceType: "company_compliance",
      sourceId: complianceId,
      processIds: [processOneId, processTwoId],
    });
    const links = await db
      .select()
      .from(linkedCommitments)
      .where(
        and(
          eq(linkedCommitments.companyId, companyId),
          eq(linkedCommitments.sourceType, "company_compliance")
        )
      );
    const editResult = await complianceManagerCaller().update({
      id: complianceId,
      description:
        "Descripción que el Gerente puede actualizar sin tocar la vigencia vinculada.",
    });
    expect(editResult.success).toBe(true);

    await db.insert(linkedCommitmentEvidence).values({
      companyId,
      linkedCommitmentId: links[0].id,
      fileName: "evidencia-luae.pdf",
      fileKey: "tests/evidencia-luae.pdf",
      fileUrl: "/local-storage/tests/evidencia-luae.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 12,
    });
    const sourceEvidence = await manager.listSourceEvidence({
      companyId,
      sourceType: "company_compliance",
      sourceId: complianceId,
    });
    expect(sourceEvidence).toHaveLength(1);
    expect(sourceEvidence[0]).toMatchObject({
      fileName: "evidencia-luae.pdf",
      processId: links[0].processId,
    });

    for (const link of links) {
      await leaderCaller(link.processId).updateProgress({
        id: link.id,
        companyId,
        renewedValidFrom: "2027-01-01",
        renewedValidUntil:
          link.processId === processOneId ? "2027-11-30" : "2027-10-31",
        status: "completed",
      });
    }
    const [compliance] = await db
      .select()
      .from(companyCompliances)
      .where(eq(companyCompliances.id, complianceId));
    expect(compliance.completed).toBe("SI");
    expect(new Date(compliance.validUntil!).toISOString().slice(0, 10)).toBe(
      "2027-10-31"
    );
  });
});
