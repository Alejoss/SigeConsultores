import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, processFODA, processes } from "../../drizzle/schema";
import { getDb } from "../db";
import { strategicTrendsRouter } from "../routers/strategicTrends";

const testName = `Prueba porcentaje OTG ${Date.now()}`;
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId = 0;
let processId = 0;

function adminCaller() {
  return strategicTrendsRouter.createCaller({
    user: { role: "admin" },
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
  } as never);
}

describe("Resumen OTG de Desempeño", () => {
  beforeAll(async () => {
    db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
    if (!db) throw new Error("La base local no está disponible para pruebas de OTG.");

    const company = await db.insert(companies).values({
      name: testName,
      description: "Empresa temporal para validar porcentajes OTG.",
      ownerAccountId: 1,
      status: "En Proceso",
    });
    companyId = Number(company[0].insertId);

    const process = await db.insert(processes).values({
      companyId,
      name: "Proceso OTG de prueba",
      processType: "estrategico",
    });
    processId = Number(process[0].insertId);

    await db.insert(processFODA).values({
      processId,
      matrixData: JSON.stringify([
        {
          id: "otg-actual",
          objetivoLogrado: "NO",
          comunicado: "SI",
          acciones: [
            {
              ponderacion: 60,
              tipoSeguimiento: "mensual_checklist",
              checklistValues: [true, true, true, true, true, true, true, true, false, false, false, false],
              porcentajeCompletado: 67,
            },
            {
              ponderacion: 40,
              tipoSeguimiento: "puntual",
              valorPuntual: 7,
              puntoLlegadaAccion: 10,
              porcentajeCompletado: 70,
            },
          ],
        },
        {
          id: "otg-sin-tareas",
          objetivoLogrado: "SI",
          comunicado: "NO",
          porcentajeAlcanzadoOTG: 82,
          acciones: [],
        },
      ]),
    });
  });

  afterAll(async () => {
    if (!db) return;
    if (processId) await db.delete(processFODA).where(eq(processFODA.processId, processId));
    if (processId) await db.delete(processes).where(eq(processes.id, processId));
    if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
  });

  it("usa los porcentajes actuales de las tareas OTG en lugar de devolver cero", async () => {
    const rows = await adminCaller().getOtgByArea({ companyId });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      processId,
      totalOTG: 2,
      logrados: 1,
      comunicados: 1,
      percent: 75,
    });
  });
});
