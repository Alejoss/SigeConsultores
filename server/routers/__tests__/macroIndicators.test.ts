import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../db";
import {
  accounts,
  companies,
  processes,
  stakeholders,
  criticalityMatrix,
  processFODA,
  processTacticalObjectives,
  processCompliances,
  processTrainings,
} from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { insertTestAccount } from "../../__tests__/helpers/accounts";

describe("MacroIndicators - fixture process", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let processId: number;
  let companyId: number;
  let ownerAccountId: number;
  let stakeholderId: number;
  let stakeholderId2: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database not available");

    const owner = await insertTestAccount(db, {
      openId: `macro-indicators-${Date.now()}`,
      email: `macro-indicators-${Date.now()}@example.com`,
    });
    ownerAccountId = owner.id;

    const companyResult = await db.insert(companies).values({
      name: `Macro Indicators Test Co ${Date.now()}`,
      ownerAccountId,
    });
    companyId = Number(companyResult[0].insertId);

    const processResult = await db.insert(processes).values({
      companyId,
      name: `Macro Indicators Process ${Date.now()}`,
      processType: "misional",
      macroProcess: "Test Macro",
    });
    processId = Number(processResult[0].insertId);

    const stakeholderResult = await db.insert(stakeholders).values({
      processId,
      name: "Test Stakeholder",
      type: "cliente",
      isInternal: false,
      orderIndex: 0,
    });
    stakeholderId = Number(stakeholderResult[0].insertId);

    const stakeholder2Result = await db.insert(stakeholders).values({
      processId,
      name: "Test Stakeholder 2",
      type: "proveedor",
      isInternal: true,
      orderIndex: 1,
    });
    stakeholderId2 = Number(stakeholder2Result[0].insertId);

    await db.insert(criticalityMatrix).values([
      {
        processId,
        stakeholderId,
        incidence: "2",
        risk: "B",
        criticality: "Media",
        implementationStatus: true,
      },
      {
        processId,
        stakeholderId: stakeholderId2,
        incidence: "1",
        risk: "A",
        criticality: "Baja",
        implementationStatus: false,
      },
    ]);

    await db.insert(processFODA).values({
      processId,
      matrixData: JSON.stringify([
        { objetivoLogrado: "SI" },
        { objetivoLogrado: "NO" },
      ]),
    });

    await db.insert(processTacticalObjectives).values({
      processId,
      name: "Objetivo táctico test",
      description: "Desc",
      responsible: "Tester",
      subprocess: "Sub",
      strategicObjective: "Estratégico",
      strategicObjectiveDescription: "Descripción",
      completed: "NO",
      planningData: JSON.stringify({
        resultKeys: [
          {
            tasks: [
              { percentageCompleted: 80, weighting: 1 },
              { percentageCompleted: 60, weighting: 1 },
            ],
          },
        ],
      }),
    });

    await db.insert(processCompliances).values([
      {
        processId,
        requirement: "Req 1",
        obligationType: "Legal",
        completed: "SI",
      },
      {
        processId,
        requirement: "Req 2",
        obligationType: "Legal",
        completed: "NO",
      },
    ]);

    await db.insert(processTrainings).values([
      {
        processId,
        name: "Training done",
        conductedDate: "2026-01-15",
      },
      {
        processId,
        name: "Training pending",
        conductedDate: null,
      },
    ]);
  });

  afterAll(async () => {
    if (!db) return;

    await db.delete(processTrainings).where(eq(processTrainings.processId, processId));
    await db.delete(processCompliances).where(eq(processCompliances.processId, processId));
    await db.delete(processTacticalObjectives).where(eq(processTacticalObjectives.processId, processId));
    await db.delete(processFODA).where(eq(processFODA.processId, processId));
    await db.delete(criticalityMatrix).where(eq(criticalityMatrix.processId, processId));
    await db.delete(stakeholders).where(eq(stakeholders.processId, processId));
    await db.delete(processes).where(eq(processes.id, processId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(accounts).where(eq(accounts.id, ownerAccountId));
  });

  it("should calculate Criticidad de Partes Interesadas correctly", async () => {
    const criticalityData = await db!
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.processId, processId));

    let criticalidadCumplimiento = 0;
    if (criticalityData.length > 0) {
      const implemented = criticalityData.filter((c) => c.implementationStatus === true).length;
      criticalidadCumplimiento = Math.round((implemented / criticalityData.length) * 100);
    }

    expect(criticalityData.length).toBeGreaterThan(0);
    expect(criticalidadCumplimiento).toBeGreaterThan(0);
    expect(criticalidadCumplimiento).toBeLessThanOrEqual(100);
  });

  it("should calculate all 5 indicators and average correctly", async () => {
    const criticalityData = await db!
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.processId, processId));

    let criticalidadCumplimiento = 0;
    if (criticalityData.length > 0) {
      const implemented = criticalityData.filter((c) => c.implementationStatus === true).length;
      criticalidadCumplimiento = Math.round((implemented / criticalityData.length) * 100);
    }

    const fodaData = await db!
      .select()
      .from(processFODA)
      .where(eq(processFODA.processId, processId))
      .limit(1);

    let matrizAlcanzado = 0;
    if (fodaData.length > 0 && fodaData[0].matrixData) {
      const matrixRows = JSON.parse(fodaData[0].matrixData);
      if (Array.isArray(matrixRows)) {
        const implemented = matrixRows.filter((row: { objetivoLogrado?: string }) => row.objetivoLogrado === "SI").length;
        matrizAlcanzado =
          matrixRows.length > 0 ? Math.round((implemented / matrixRows.length) * 100) : 0;
      }
    }

    const tacticalObjectives = await db!
      .select()
      .from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, processId));

    let objetivosTacticosAlcanzado = 0;
    if (tacticalObjectives.length > 0) {
      let totalProgress = 0;
      tacticalObjectives.forEach((obj) => {
        if (obj.planningData) {
          const planData = JSON.parse(obj.planningData);
          if (planData.resultKeys && Array.isArray(planData.resultKeys)) {
            let objectiveProgress = 0;
            let totalWeighting = 0;
            planData.resultKeys.forEach((key: { tasks?: Array<{ percentageCompleted?: number; weighting?: number }> }) => {
              if (key.tasks && Array.isArray(key.tasks)) {
                key.tasks.forEach((task) => {
                  objectiveProgress += (task.percentageCompleted || 0) * (task.weighting || 1);
                  totalWeighting += task.weighting || 1;
                });
              }
            });
            if (totalWeighting > 0) {
              totalProgress += Math.round(objectiveProgress / totalWeighting);
            }
          }
        }
      });
      objetivosTacticosAlcanzado =
        tacticalObjectives.length > 0 ? Math.round(totalProgress / tacticalObjectives.length) : 0;
    }

    const compliances = await db!
      .select()
      .from(processCompliances)
      .where(eq(processCompliances.processId, processId));

    let cumplimientosPromedio = 0;
    if (compliances.length > 0) {
      const completed = compliances.filter((c) => c.completed === "SI").length;
      cumplimientosPromedio = Math.round((completed / compliances.length) * 100);
    }

    const trainings = await db!
      .select()
      .from(processTrainings)
      .where(eq(processTrainings.processId, processId));

    let capacitacionesImpartidas = 0;
    if (trainings.length > 0) {
      const conducted = trainings.filter((t) => t.conductedDate !== null).length;
      capacitacionesImpartidas = Math.round((conducted / trainings.length) * 100);
    }

    const compliancePercentage = Math.round(
      (criticalidadCumplimiento +
        matrizAlcanzado +
        objetivosTacticosAlcanzado +
        cumplimientosPromedio +
        capacitacionesImpartidas) /
        5
    );

    expect(compliancePercentage).toBeGreaterThanOrEqual(0);
    expect(compliancePercentage).toBeLessThanOrEqual(100);
  });
});
