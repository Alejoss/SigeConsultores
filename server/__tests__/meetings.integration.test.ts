import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  companies,
  linkedCommitmentEvidence,
  linkedCommitments,
  meetingAgreementEvidence,
  meetingAgreements,
  meetingFiles,
  meetingTypes,
  processMeetings,
  processes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { getConsolidatedScheduleActivities } from "../lib/consolidatedScheduleActivities";
import { linkedCommitmentsRouter } from "../routers/linkedCommitments";
import { meetingsRouter } from "../routers/meetings";

const testName = `Prueba reuniones manuales ${Date.now()}`;
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId = 0;
let foreignCompanyId = 0;
let sourceProcessId = 0;
let targetProcessId = 0;
let foreignProcessId = 0;
let typeId = 0;
let meetingId = 0;

function adminMeetingsCaller() {
  return meetingsRouter.createCaller({
    user: { role: "admin" },
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
  } as never);
}

function leaderMeetingsCaller(processId: number) {
  return meetingsRouter.createCaller({
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

function targetLeaderCommitmentsCaller() {
  return linkedCommitmentsRouter.createCaller({
    user: null,
    manager: null,
    processLeader: {
      processLeaderId: 2,
      leaderName: "Jefe destino de prueba",
      leaderEmail: "destino@example.com",
      processId: targetProcessId,
      companyId,
      companyName: testName,
    },
    req: {} as never,
    res: {} as never,
  } as never);
}

beforeAll(async () => {
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db) throw new Error("La base local no está disponible para pruebas de integración.");

  const company = await db.insert(companies).values({
    name: testName,
    description: "Datos temporales de prueba de Reuniones; autolimpiables.",
    ownerAccountId: 1,
    status: "En Proceso",
  });
  companyId = Number(company[0].insertId);
  const foreignCompany = await db.insert(companies).values({
    name: `${testName} extranjera`,
    description: "Empresa temporal para validación de aislamiento.",
    ownerAccountId: 1,
    status: "En Proceso",
  });
  foreignCompanyId = Number(foreignCompany[0].insertId);

  const source = await db.insert(processes).values({
    companyId,
    name: "Proceso fuente de prueba",
    processType: "estrategico",
  });
  sourceProcessId = Number(source[0].insertId);
  const target = await db.insert(processes).values({
    companyId,
    name: "Proceso destino de prueba",
    processType: "soporte",
  });
  targetProcessId = Number(target[0].insertId);
  const foreign = await db.insert(processes).values({
    companyId: foreignCompanyId,
    name: "Proceso de empresa extranjera",
    processType: "misional",
  });
  foreignProcessId = Number(foreign[0].insertId);
});

afterAll(async () => {
  if (!db) return;
  if (companyId) {
    await db.delete(linkedCommitmentEvidence).where(eq(linkedCommitmentEvidence.companyId, companyId));
    await db.delete(meetingAgreementEvidence).where(eq(meetingAgreementEvidence.companyId, companyId));
    await db.delete(meetingFiles).where(eq(meetingFiles.companyId, companyId));
    await db.delete(linkedCommitments).where(eq(linkedCommitments.companyId, companyId));
    await db.delete(meetingAgreements).where(eq(meetingAgreements.companyId, companyId));
    await db.delete(processMeetings).where(eq(processMeetings.companyId, companyId));
    await db.delete(meetingTypes).where(eq(meetingTypes.companyId, companyId));
    await db.delete(processes).where(eq(processes.companyId, companyId));
    await db.delete(companies).where(eq(companies.id, companyId));
  }
  if (foreignCompanyId) {
    await db.delete(processes).where(eq(processes.companyId, foreignCompanyId));
    await db.delete(companies).where(eq(companies.id, foreignCompanyId));
  }
});

describe("Reuniones manuales: integración local", () => {
  it("crea un tipo y una reunión con acta persistida", async () => {
    const manager = adminMeetingsCaller();
    const type = await manager.createType({
      companyId,
      processId: sourceProcessId,
      name: "Staff de prueba",
      description: "Tipo temporal",
    });
    typeId = type.id;
    const meeting = await manager.createMeeting({
      companyId,
      processId: sourceProcessId,
      meetingTypeId: typeId,
      meetingDate: "2026-09-17",
      objective: "Validar acuerdos y compromisos de la prueba",
      participants: "Participante temporal",
      locationOrMedium: "Presencial",
    });
    meetingId = meeting.id;
    const minutes = await manager.generateMinutes({ companyId, meetingId, save: true });
    expect(minutes.minutesText).toContain("ACTA DE REUNIÓN");
    expect(minutes.minutesText).toContain("Staff de prueba");

    const [saved] = await db
      .select()
      .from(processMeetings)
      .where(eq(processMeetings.id, meetingId));
    expect(saved.minutesText).toContain("Validar acuerdos");
  });

  it("controla localmente el acuerdo de un empleado sin acceso", async () => {
    const manager = adminMeetingsCaller();
    const created = await manager.createAgreement({
      companyId,
      meetingId,
      description: "Completar evidencia interna de prueba",
      responsibleType: "same_process_employee",
      responsibleName: "Empleado temporal",
      responsibleEmail: "empleado-temporal@example.com",
      dueDate: "2026-10-01",
    });
    expect(created.linkedCommitmentId).toBeNull();
    await manager.updateLocalAgreementStatus({
      companyId,
      id: created.id,
      status: "completed",
    });
    const [agreement] = await db
      .select()
      .from(meetingAgreements)
      .where(eq(meetingAgreements.id, created.id));
    expect(agreement.status).toBe("completed");
    expect(agreement.communicationStatus).toBe("not_requested");
  });

  it("autovincula al dueño del proceso y se refleja en Cronograma consolidado", async () => {
    const manager = adminMeetingsCaller();
    const created = await manager.createAgreement({
      companyId,
      meetingId,
      description: "Cerrar acción propia de prueba",
      responsibleType: "same_process_owner",
      responsibleName: "Dueño de proceso",
      dueDate: "2026-10-02",
    });
    expect(created.linkedCommitmentId).toBeTypeOf("number");
    const [link] = await db
      .select()
      .from(linkedCommitments)
      .where(
        and(
          eq(linkedCommitments.companyId, companyId),
          eq(linkedCommitments.sourceType, "meeting_agreement"),
          eq(linkedCommitments.sourceId, created.id),
          eq(linkedCommitments.processId, sourceProcessId)
        )
      );
    expect(link).toBeTruthy();
    const schedule = await getConsolidatedScheduleActivities(sourceProcessId);
    expect(schedule.some(item => item.id === `linked-commitment-${link.id}`)).toBe(true);
  });

  it("vincula a otro proceso una sola vez y devuelve el cumplimiento al acuerdo", async () => {
    const manager = adminMeetingsCaller();
    const created = await manager.createAgreement({
      companyId,
      meetingId,
      description: "Implementar mejora en el proceso destino",
      responsibleType: "other_process",
      responsibleName: "Responsable destino",
      targetProcessId,
      dueDate: "2026-10-03",
    });
    expect(created.linkedCommitmentId).toBeTypeOf("number");

    await manager.changeAgreementAssignment({
      companyId,
      id: created.id,
      responsibleType: "other_process",
      responsibleName: "Responsable destino",
      targetProcessId,
    });
    const links = await db
      .select()
      .from(linkedCommitments)
      .where(
        and(
          eq(linkedCommitments.companyId, companyId),
          eq(linkedCommitments.sourceType, "meeting_agreement"),
          eq(linkedCommitments.sourceId, created.id)
        )
      );
    expect(links).toHaveLength(1);
    expect(links[0].processId).toBe(targetProcessId);

    await targetLeaderCommitmentsCaller().updateProgress({
      id: links[0].id,
      companyId,
      status: "completed",
    });
    const [agreement] = await db
      .select()
      .from(meetingAgreements)
      .where(eq(meetingAgreements.id, created.id));
    expect(agreement.status).toBe("completed");

    const targetSchedule = await getConsolidatedScheduleActivities(targetProcessId);
    expect(targetSchedule.some(item => item.id === `linked-commitment-${links[0].id}`)).toBe(true);
  });

  it("impide que un Jefe asigne un acuerdo a otro proceso", async () => {
    const leader = leaderMeetingsCaller(sourceProcessId);
    await expect(
      leader.createAgreement({
        companyId,
        meetingId,
        description: "Intento no autorizado de asignación externa",
        responsibleType: "other_process",
        targetProcessId,
      })
    ).rejects.toThrow("no asignar responsabilidades a otro proceso");
  });

  it("impide enlaces hacia procesos de otra empresa", async () => {
    const manager = adminMeetingsCaller();
    await expect(
      manager.createAgreement({
        companyId,
        meetingId,
        description: "Intento de cruce de empresas",
        responsibleType: "other_process",
        targetProcessId: foreignProcessId,
      })
    ).rejects.toThrow("no pertenece a esta empresa");
  });

  it("solo elimina reuniones vacías y anula las que ya tienen historial", async () => {
    const manager = adminMeetingsCaller();
    const empty = await manager.createMeeting({
      companyId,
      processId: sourceProcessId,
      meetingTypeId: typeId,
      meetingDate: "2026-09-18",
      objective: "Reunión vacía de prueba",
    });
    await manager.deleteEmptyMeeting({ companyId, id: empty.id });
    const gone = await db
      .select({ id: processMeetings.id })
      .from(processMeetings)
      .where(eq(processMeetings.id, empty.id));
    expect(gone).toHaveLength(0);

    await expect(manager.deleteEmptyMeeting({ companyId, id: meetingId })).rejects.toThrow(
      "Solo puede eliminar una reunión vacía"
    );
    await manager.annulMeeting({
      companyId,
      id: meetingId,
      reason: "Anulación temporal para validar conservación histórica",
    });
    const [annulled] = await db
      .select()
      .from(processMeetings)
      .where(eq(processMeetings.id, meetingId));
    expect(annulled.status).toBe("annulled");
    const preserved = await db
      .select({ id: meetingAgreements.id })
      .from(meetingAgreements)
      .where(eq(meetingAgreements.meetingId, meetingId));
    expect(preserved.length).toBeGreaterThan(0);
  });

  it("bloquea a un Jefe el acceso a reuniones de otro proceso", async () => {
    await expect(
      leaderMeetingsCaller(sourceProcessId).list({
        companyId,
        processId: targetProcessId,
      })
    ).rejects.toThrow("solo puede gestionar las reuniones de su proceso");
  });
});
