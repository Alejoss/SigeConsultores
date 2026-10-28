import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  companies,
  processCharacterizations,
  processParticipants,
  processes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { payrollRouter } from "../routers/payroll";

const testName = `Prueba descriptivos de cargo ${Date.now()}`;

let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId = 0;
let otherCompanyId = 0;
let firstProcessId = 0;
let secondProcessId = 0;
let firstCharacterizationId = 0;
let secondCharacterizationId = 0;

const context = (
  overrides: Partial<Record<"user" | "manager" | "processLeader", unknown>>
) =>
  ({
    user: null,
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
    ...overrides,
  }) as never;

const managerCaller = () =>
  payrollRouter.createCaller(
    context({
      manager: {
        companyId,
        companyName: testName,
        managerEmail: "descriptivos.gerente@example.test",
      },
    })
  );

const leaderCaller = () =>
  payrollRouter.createCaller(
    context({
      processLeader: {
        processLeaderId: 999001,
        leaderName: "Jefe lector de prueba",
        leaderEmail: "descriptivos.jefe@example.test",
        processId: firstProcessId,
        companyId,
        companyName: testName,
      },
    })
  );

const otherCompanyLeaderCaller = () =>
  payrollRouter.createCaller(
    context({
      processLeader: {
        processLeaderId: 999002,
        leaderName: "Jefe de otra empresa",
        leaderEmail: "descriptivos.ajeno@example.test",
        processId: 999999,
        companyId: otherCompanyId,
        companyName: "Empresa ajena de prueba",
      },
    })
  );

beforeAll(async () => {
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db)
    throw new Error("Base local no disponible para la prueba de descriptivos.");

  const company = await db.insert(companies).values({
    name: testName,
    description:
      "Datos sintéticos y autolimpiables para descriptivos de cargo.",
    ownerAccountId: 1,
    status: "En Proceso",
  });
  companyId = Number(company[0].insertId);

  const otherCompany = await db.insert(companies).values({
    name: `${testName} ajena`,
    ownerAccountId: 1,
    status: "En Proceso",
  });
  otherCompanyId = Number(otherCompany[0].insertId);

  const firstProcess = await db.insert(processes).values({
    companyId,
    name: "Comercial y Servicio",
    processType: "misional",
  });
  firstProcessId = Number(firstProcess[0].insertId);
  const secondProcess = await db.insert(processes).values({
    companyId,
    name: "Talento Humano",
    processType: "soporte",
  });
  secondProcessId = Number(secondProcess[0].insertId);

  const firstCharacterization = await db
    .insert(processCharacterizations)
    .values({
      processId: firstProcessId,
      macroProcess: "Misional",
    });
  firstCharacterizationId = Number(firstCharacterization[0].insertId);
  const secondCharacterization = await db
    .insert(processCharacterizations)
    .values({
      processId: secondProcessId,
      macroProcess: "Apoyo",
    });
  secondCharacterizationId = Number(secondCharacterization[0].insertId);

  await db.insert(processParticipants).values([
    {
      processCharacterizationId: firstCharacterizationId,
      position: "Asesor Comercial",
      objective:
        "Atender requerimientos y desarrollar oportunidades comerciales.",
      responsibility:
        "Gestionar la relación con clientes y registrar oportunidades.",
      authority:
        "Proponer condiciones comerciales dentro de las políticas vigentes.",
      orderIndex: 2,
    },
    {
      processCharacterizationId: firstCharacterizationId,
      position: "Coordinador Comercial",
      objective: "Coordinar la gestión comercial del proceso.",
      responsibility:
        "Dar seguimiento al equipo y a los indicadores del proceso.",
      authority: "Distribuir actividades comerciales del equipo.",
      orderIndex: 1,
    },
    {
      // Compatibilidad histórica: algunas filas se relacionaron con el processId.
      processCharacterizationId: secondProcessId,
      position: "Analista de Desarrollo Humano",
      objective: "Asegurar el soporte oportuno al personal.",
      responsibility: "Mantener actualizados los registros del personal.",
      authority: "Solicitar la información necesaria para los registros.",
      orderIndex: 1,
    },
  ]);
});

afterAll(async () => {
  if (!db) return;
  const processIds = [firstProcessId, secondProcessId].filter(Boolean);
  const characterizationIds = [
    firstCharacterizationId,
    secondCharacterizationId,
  ].filter(Boolean);
  if (processIds.length || characterizationIds.length) {
    await db
      .delete(processParticipants)
      .where(
        inArray(processParticipants.processCharacterizationId, [
          ...processIds,
          ...characterizationIds,
        ])
      );
  }
  if (characterizationIds.length) {
    await db
      .delete(processCharacterizations)
      .where(inArray(processCharacterizations.id, characterizationIds));
  }
  if (processIds.length) {
    await db.delete(processes).where(inArray(processes.id, processIds));
  }
  if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
  if (otherCompanyId)
    await db.delete(companies).where(eq(companies.id, otherCompanyId));
});

describe("Nómina: descriptivos de cargo consolidados", () => {
  it("consolida los puestos actuales y los vínculos históricos, en orden y sin datos de nómina", async () => {
    const result = await managerCaller().jobDescriptions({ companyId });

    expect(result.map(process => process.name)).toEqual([
      "Comercial y Servicio",
      "Talento Humano",
    ]);
    const commercial = result.find(process => process.id === firstProcessId);
    const talent = result.find(process => process.id === secondProcessId);
    expect(commercial?.macroProcess).toBe("Misional");
    expect(commercial?.positions.map(position => position.position)).toEqual([
      "Coordinador Comercial",
      "Asesor Comercial",
    ]);
    expect(commercial?.positions[0]).toMatchObject({
      objective: "Coordinar la gestión comercial del proceso.",
      responsibility:
        "Dar seguimiento al equipo y a los indicadores del proceso.",
      authority: "Distribuir actividades comerciales del equipo.",
    });
    expect(talent?.positions).toHaveLength(1);
    expect(talent?.positions[0]).toMatchObject({
      position: "Analista de Desarrollo Humano",
      objective: "Asegurar el soporte oportuno al personal.",
    });
    expect(JSON.stringify(result)).not.toContain("identityCard");
    expect(JSON.stringify(result)).not.toContain("payrollEmployee");
  });

  it("permite la consulta consolidada a un Jefe de Proceso de la misma empresa", async () => {
    const result = await leaderCaller().jobDescriptions({ companyId });
    expect(result).toHaveLength(2);
    expect(
      result.flatMap(process =>
        process.positions.map(position => position.position)
      )
    ).toEqual(
      expect.arrayContaining([
        "Coordinador Comercial",
        "Analista de Desarrollo Humano",
      ])
    );
  });

  it("rechaza consultar los descriptivos de otra empresa", async () => {
    await expect(
      otherCompanyLeaderCaller().jobDescriptions({ companyId })
    ).rejects.toThrow("No tiene acceso a esta empresa");
  });
});
