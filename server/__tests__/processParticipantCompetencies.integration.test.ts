import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  companies,
  processCharacterizations,
  processParticipantCompetencies,
  processParticipants,
  processes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { processParticipantsRouter } from "../routers/processParticipants";

const testName = `Prueba competencias de cargo ${Date.now()}`;

let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId = 0;
let otherCompanyId = 0;
let processId = 0;
let otherProcessId = 0;
let characterizationId = 0;
let participantId = 0;
let cascadeParticipantId = 0;
let competencyId = 0;

function callerForLeader(processIdForSession: number) {
  return processParticipantsRouter.createCaller({
    user: null,
    manager: null,
    processLeader: {
      processLeaderId: 1,
      leaderName: "Jefe temporal",
      leaderEmail: "jefe-temporal@example.com",
      processId: processIdForSession,
      companyId,
      companyName: testName,
    },
    req: {} as never,
    res: {} as never,
  } as never);
}

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
    description: "Datos sintéticos autolimpiables para Competencias de cargo.",
    ownerAccountId: 1,
    status: "En Proceso",
  });
  companyId = Number(company[0].insertId);
  const otherCompany = await db.insert(companies).values({
    name: `${testName} externa`,
    description: "Empresa sintética externa para validar aislamiento.",
    ownerAccountId: 1,
    status: "En Proceso",
  });
  otherCompanyId = Number(otherCompany[0].insertId);

  const [processResult, otherProcessResult] = await Promise.all([
    db.insert(processes).values({
      companyId,
      name: "Proceso temporal de Competencias",
      processType: "soporte",
    }),
    db.insert(processes).values({
      companyId,
      name: "Otro proceso temporal",
      processType: "misional",
    }),
  ]);
  processId = Number(processResult[0].insertId);
  otherProcessId = Number(otherProcessResult[0].insertId);
  const characterization = await db.insert(processCharacterizations).values({
    processId,
  });
  characterizationId = Number(characterization[0].insertId);
  const participant = await db.insert(processParticipants).values({
    processCharacterizationId: characterizationId,
    position: "Puesto temporal de Competencias",
    orderIndex: 0,
  });
  participantId = Number(participant[0].insertId);
});

afterAll(async () => {
  if (!db) return;
  if (processId) {
    const participantRows = await db
      .select({ id: processParticipants.id })
      .from(processParticipants)
      .where(
        eq(processParticipants.processCharacterizationId, characterizationId)
      );
    const participantIds = participantRows.map(row => row.id);
    if (participantIds.length) {
      await db
        .delete(processParticipantCompetencies)
        .where(
          inArray(
            processParticipantCompetencies.processParticipantId,
            participantIds
          )
        );
      await db
        .delete(processParticipants)
        .where(
          eq(processParticipants.processCharacterizationId, characterizationId)
        );
    }
    await db
      .delete(processCharacterizations)
      .where(eq(processCharacterizations.id, characterizationId));
    await db.delete(processes).where(eq(processes.companyId, companyId));
  }
  if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
  if (otherCompanyId)
    await db.delete(companies).where(eq(companies.id, otherCompanyId));
});

describe("Competencias de cargo: integración local", () => {
  it("crea, lista, actualiza y elimina competencias con nombres propios", async () => {
    const caller = callerForLeader(processId);
    const created = await caller.createCompetency({
      companyId,
      processParticipantId: participantId,
      name: "Manejo de equipos de refrigeración",
      competencyType: "tecnica",
      competencyLevel: "avanzado",
    });
    competencyId = created.competency?.id || 0;
    expect(competencyId).toBeGreaterThan(0);

    await caller.createCompetency({
      companyId,
      processParticipantId: participantId,
      name: "Comunicación efectiva",
      competencyType: "transversal",
      competencyLevel: "intermedio",
    });

    const listed = await caller.list({
      companyId,
      processCharacterizationId: characterizationId,
    });
    const participant = listed.find(row => row.id === participantId);
    expect(participant?.competencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Manejo de equipos de refrigeración",
          competencyType: "tecnica",
          competencyLevel: "avanzado",
        }),
        expect.objectContaining({ name: "Comunicación efectiva" }),
      ])
    );

    await caller.updateCompetency({
      companyId,
      competencyId,
      name: "Manejo seguro de equipos de refrigeración",
      competencyType: "tecnica",
      competencyLevel: "experto",
    });
    const [updated] = await db
      .select()
      .from(processParticipantCompetencies)
      .where(eq(processParticipantCompetencies.id, competencyId));
    expect(updated).toMatchObject({
      name: "Manejo seguro de equipos de refrigeración",
      competencyLevel: "experto",
    });

    await caller.deleteCompetency({ companyId, competencyId });
    const deleted = await db
      .select()
      .from(processParticipantCompetencies)
      .where(eq(processParticipantCompetencies.id, competencyId));
    expect(deleted).toHaveLength(0);
  });

  it("protege las competencias de otros procesos y empresas", async () => {
    const caller = callerForLeader(processId);
    const created = await caller.createCompetency({
      companyId,
      processParticipantId: participantId,
      name: "Planificación y organización",
      competencyType: "transversal",
      competencyLevel: "basico",
    });
    const protectedCompetencyId = created.competency?.id || 0;

    await expect(
      callerForLeader(otherProcessId).updateCompetency({
        companyId,
        competencyId: protectedCompetencyId,
        name: "No autorizado",
        competencyType: "transversal",
        competencyLevel: "basico",
      })
    ).rejects.toThrow("No tiene acceso a este proceso");

    await expect(
      adminCaller().createCompetency({
        companyId: otherCompanyId,
        processParticipantId: participantId,
        name: "No debe guardarse",
        competencyType: "tecnica",
        competencyLevel: "basico",
      })
    ).rejects.toThrow("no pertenece a esta empresa");
  });

  it("elimina automáticamente las competencias si se elimina su puesto", async () => {
    const participant = await db.insert(processParticipants).values({
      processCharacterizationId: characterizationId,
      position: "Puesto temporal de cascada",
      orderIndex: 1,
    });
    cascadeParticipantId = Number(participant[0].insertId);
    await db.insert(processParticipantCompetencies).values({
      processParticipantId: cascadeParticipantId,
      name: "Competencia temporal de cascada",
      competencyType: "liderazgo",
      competencyLevel: "intermedio",
    });
    await db
      .delete(processParticipants)
      .where(eq(processParticipants.id, cascadeParticipantId));
    const remaining = await db
      .select()
      .from(processParticipantCompetencies)
      .where(
        eq(
          processParticipantCompetencies.processParticipantId,
          cascadeParticipantId
        )
      );
    expect(remaining).toHaveLength(0);
  });
});
