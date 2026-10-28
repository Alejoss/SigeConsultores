import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  companies,
  participantWorkerAssignments,
  payrollEmployees,
  processCharacterizations,
  processParticipants,
  processes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { processParticipantsRouter } from "../routers/processParticipants";

const testName = `Prueba áreas múltiples Participantes ${Date.now()}`;

let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId = 0;
let processId = 0;
let characterizationId = 0;
let participantId = 0;
let administrationEmployeeId = 0;
let logisticsEmployeeId = 0;
let humanResourcesEmployeeId = 0;

function adminCaller() {
  return processParticipantsRouter.createCaller({
    user: { role: "admin" },
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
  } as never);
}

beforeAll(async () => {
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db)
    throw new Error("La base local no está disponible para esta integración.");

  const company = await db.insert(companies).values({
    name: testName,
    description:
      "Datos temporales autolimpiables para áreas múltiples de Participantes.",
    ownerAccountId: 1,
    status: "En Proceso",
  });
  companyId = Number(company[0].insertId);

  const process = await db.insert(processes).values({
    companyId,
    name: "Proceso temporal de Participantes",
    processType: "soporte",
  });
  processId = Number(process[0].insertId);

  const characterization = await db.insert(processCharacterizations).values({
    processId,
    payrollArea: "Administración",
  });
  characterizationId = Number(characterization[0].insertId);

  const participant = await db.insert(processParticipants).values({
    processCharacterizationId: characterizationId,
    position: "Puesto temporal de prueba",
    orderIndex: 0,
  });
  participantId = Number(participant[0].insertId);

  await db.insert(payrollEmployees).values([
    {
      companyId,
      fullName: "Trabajadora temporal Administración",
      identityCard: `${companyId}001`,
      hireDate: new Date("2026-01-02T12:00:00Z"),
      area: "Administración",
      position: "Asistente",
      status: "activo",
    },
    {
      companyId,
      fullName: "Trabajadora temporal Logística",
      identityCard: `${companyId}002`,
      hireDate: new Date("2026-01-02T12:00:00Z"),
      area: "Logística",
      position: "Auxiliar",
      status: "activo",
    },
    {
      companyId,
      fullName: "Trabajadora temporal Talento Humano",
      identityCard: `${companyId}003`,
      hireDate: new Date("2026-01-02T12:00:00Z"),
      area: "Talento Humano",
      position: "Analista",
      status: "activo",
    },
  ]);
  const employees = await db
    .select()
    .from(payrollEmployees)
    .where(eq(payrollEmployees.companyId, companyId));
  administrationEmployeeId =
    employees.find(employee => employee.area === "Administración")?.id || 0;
  logisticsEmployeeId =
    employees.find(employee => employee.area === "Logística")?.id || 0;
  humanResourcesEmployeeId =
    employees.find(employee => employee.area === "Talento Humano")?.id || 0;
  if (
    !administrationEmployeeId ||
    !logisticsEmployeeId ||
    !humanResourcesEmployeeId
  ) {
    throw new Error("No se crearon los trabajadores sintéticos de la prueba.");
  }
});

afterAll(async () => {
  if (!db || !companyId) return;
  await db
    .update(payrollEmployees)
    .set({ currentProcessParticipantId: null })
    .where(eq(payrollEmployees.companyId, companyId));
  if (participantId) {
    await db
      .delete(participantWorkerAssignments)
      .where(
        eq(participantWorkerAssignments.processParticipantId, participantId)
      );
    await db
      .delete(processParticipants)
      .where(eq(processParticipants.id, participantId));
  }
  if (companyId)
    await db
      .delete(payrollEmployees)
      .where(eq(payrollEmployees.companyId, companyId));
  if (characterizationId) {
    await db
      .delete(processCharacterizations)
      .where(eq(processCharacterizations.id, characterizationId));
  }
  if (processId) await db.delete(processes).where(eq(processes.id, processId));
  await db.delete(companies).where(eq(companies.id, companyId));
});

describe("Participantes: varias áreas de Nómina", () => {
  it("conserva el área única histórica hasta que se configure una selección nueva", async () => {
    const result = await adminCaller().payrollAreaOptions({
      companyId,
      processCharacterizationId: characterizationId,
    });

    expect(result.payrollAreaSelection).toEqual({
      mode: "selected",
      areas: ["Administración"],
    });
  });

  it("permite varias áreas y muestra únicamente sus trabajadores activos", async () => {
    const caller = adminCaller();
    await caller.setPayrollAreaSelection({
      companyId,
      processCharacterizationId: characterizationId,
      selection: { mode: "selected", areas: ["Administración", "Logistica"] },
    });

    const dashboard = await caller.performanceDashboard({
      companyId,
      processCharacterizationId: characterizationId,
      year: 2026,
    });
    const availableIds =
      dashboard.participants[0]?.availableWorkers.map(worker => worker.id) ||
      [];

    expect(dashboard.payrollAreaSelection).toEqual({
      mode: "selected",
      areas: ["Administración", "Logística"],
    });
    expect(availableIds).toEqual(
      expect.arrayContaining([administrationEmployeeId, logisticsEmployeeId])
    );
    expect(availableIds).not.toContain(humanResourcesEmployeeId);

    await expect(
      caller.assignWorker({
        companyId,
        processParticipantId: participantId,
        payrollEmployeeId: humanResourcesEmployeeId,
      })
    ).rejects.toThrow("no pertenecen a las áreas");
  });

  it("incluye todas las áreas, vincula varios trabajadores y evita duplicados", async () => {
    const caller = adminCaller();
    await caller.assignWorker({
      companyId,
      processParticipantId: participantId,
      payrollEmployeeId: logisticsEmployeeId,
    });

    await expect(
      caller.setPayrollAreaSelection({
        companyId,
        processCharacterizationId: characterizationId,
        selection: { mode: "selected", areas: ["Administración"] },
      })
    ).rejects.toThrow("trabajadores ya vinculados");

    const result = await caller.setPayrollAreaSelection({
      companyId,
      processCharacterizationId: characterizationId,
      selection: { mode: "all" },
    });
    expect(result.payrollAreaSelection).toEqual({ mode: "all" });

    const dashboard = await caller.performanceDashboard({
      companyId,
      processCharacterizationId: characterizationId,
      year: 2026,
    });
    const availableIds =
      dashboard.participants[0]?.availableWorkers.map(worker => worker.id) ||
      [];
    expect(availableIds).toEqual(
      expect.arrayContaining([
        administrationEmployeeId,
        logisticsEmployeeId,
        humanResourcesEmployeeId,
      ])
    );

    const bulkResult = await caller.assignWorkers({
      companyId,
      processParticipantId: participantId,
      payrollEmployeeIds: [administrationEmployeeId, humanResourcesEmployeeId],
    });
    expect(bulkResult).toMatchObject({
      success: true,
      addedCount: 2,
      alreadyLinkedCount: 0,
    });

    const duplicateResult = await caller.assignWorkers({
      companyId,
      processParticipantId: participantId,
      payrollEmployeeIds: [administrationEmployeeId, humanResourcesEmployeeId],
    });
    expect(duplicateResult).toMatchObject({
      success: true,
      addedCount: 0,
      alreadyLinkedCount: 2,
    });

    const assignments = await db
      .select()
      .from(participantWorkerAssignments)
      .where(
        eq(participantWorkerAssignments.processParticipantId, participantId)
      );
    expect(assignments).toHaveLength(3);

    const updatedDashboard = await caller.performanceDashboard({
      companyId,
      processCharacterizationId: characterizationId,
      year: 2026,
    });
    const remainingCandidateIds =
      updatedDashboard.participants[0]?.availableWorkers
        .filter(worker => worker.currentProcessParticipantId === null)
        .map(worker => worker.id) || [];
    expect(remainingCandidateIds).not.toEqual(
      expect.arrayContaining([
        administrationEmployeeId,
        logisticsEmployeeId,
        humanResourcesEmployeeId,
      ])
    );

    const [characterization] = await db
      .select()
      .from(processCharacterizations)
      .where(eq(processCharacterizations.id, characterizationId));
    expect(characterization.payrollArea).toBe("Administración");
    expect(characterization.payrollAreaSelection).toContain('"all"');
  });
});
