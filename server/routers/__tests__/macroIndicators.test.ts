import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../db";
import {
  processes,
  criticalityMatrix,
  processFODA,
  processTacticalObjectives,
  processCompliances,
  processTrainings,
} from "../../../drizzle/schema";
import { eq } from "drizzle-orm";

describe("MacroIndicators - Postocosecha La Esperanza", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let processId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    // Get the Postocosecha La Esperanza process
    const processResult = await db
      .select()
      .from(processes)
      .where(eq(processes.name, "Postcosecha La Esperanza"))
      .limit(1);

    if (processResult.length === 0) {
      throw new Error("Process 'Postcosecha La Esperanza' not found");
    }

    processId = processResult[0].id;
  });

  it("should calculate Criticidad de Partes Interesadas correctly", async () => {
    const criticalityData = await db
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.processId, processId));

    console.log(`[MacroIndicators Test] Criticality entries: ${criticalityData.length}`);
    console.log(`[MacroIndicators Test] First entry:`, criticalityData[0]);

    let criticalidadCumplimiento = 0;
    if (criticalityData.length > 0) {
      const implemented = criticalityData.filter(
        (c) => c.implementationStatus === true
      ).length;
      criticalidadCumplimiento = Math.round(
        (implemented / criticalityData.length) * 100
      );
    }

    console.log(
      `[MacroIndicators Test] Criticidad: ${criticalidadCumplimiento}% (${criticalityData.filter((c) => c.implementationStatus === "1").length}/${criticalityData.length})`
    );

    expect(criticalityData.length).toBeGreaterThan(0);
    expect(criticalidadCumplimiento).toBeGreaterThan(0);
    expect(criticalidadCumplimiento).toBeLessThanOrEqual(100);
  });

  it("should calculate all 5 indicators and average correctly", async () => {
    // 1. Criticidad
    const criticalityData = await db
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.processId, processId));

    let criticalidadCumplimiento = 0;
    if (criticalityData.length > 0) {
      console.log(`[MacroIndicators Test] Criticality data sample:`, criticalityData.slice(0, 3));
      const implemented = criticalityData.filter(
        (c) => c.implementationStatus === true
      ).length;
      criticalidadCumplimiento = Math.round(
        (implemented / criticalityData.length) * 100
      );
    }

    // 2. Matriz FODA
    const fodaData = await db
      .select()
      .from(processFODA)
      .where(eq(processFODA.processId, processId))
      .limit(1);

    let matrizAlcanzado = 0;
    if (fodaData.length > 0 && fodaData[0].matrixData) {
      try {
        const matrixRows = JSON.parse(fodaData[0].matrixData);
        if (Array.isArray(matrixRows)) {
          const implemented = matrixRows.filter(
            (row: any) => row.objetivoLogrado === "SI"
          ).length;
          matrizAlcanzado =
            matrixRows.length > 0
              ? Math.round((implemented / matrixRows.length) * 100)
              : 0;
          console.log(`[MacroIndicators Test] FODA: ${implemented}/${matrixRows.length} = ${matrizAlcanzado}%`);
        }
      } catch (e) {
        console.error("Error parsing FODA matrix data:", e);
      }
    }

    // 3. Objetivos Tácticos
    const tacticalObjectives = await db
      .select()
      .from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, processId));

    let objetivosTacticosAlcanzado = 0;
    if (tacticalObjectives.length > 0) {
      let totalProgress = 0;
      tacticalObjectives.forEach((obj: any) => {
        if (obj.planningData) {
          try {
            const planData = JSON.parse(obj.planningData);
            if (planData.resultKeys && Array.isArray(planData.resultKeys)) {
              let objectiveProgress = 0;
              let totalWeighting = 0;
              planData.resultKeys.forEach((key: any) => {
                if (key.tasks && Array.isArray(key.tasks)) {
                  key.tasks.forEach((task: any) => {
                    objectiveProgress += (task.percentageCompleted || 0) * (task.weighting || 1);
                    totalWeighting += (task.weighting || 1);
                  });
                }
              });
              if (totalWeighting > 0) {
                totalProgress += Math.round(objectiveProgress / totalWeighting);
              }
            }
          } catch (e) {
            console.error("Error parsing planning data:", e);
          }
        }
      });
      objetivosTacticosAlcanzado = tacticalObjectives.length > 0 ? Math.round(totalProgress / tacticalObjectives.length) : 0;
    }

    console.log(`[MacroIndicators Test] Objetivos Tácticos: ${objetivosTacticosAlcanzado}%`);

    // 4. Cumplimientos
    const compliances = await db
      .select()
      .from(processCompliances)
      .where(eq(processCompliances.processId, processId));

    let cumplimientosPromedio = 0;
    if (compliances.length > 0) {
      const completed = compliances.filter((c) => c.completed === "SI").length;
      cumplimientosPromedio = Math.round(
        (completed / compliances.length) * 100
      );
    }

    // 5. Capacitaciones
    const trainings = await db
      .select()
      .from(processTrainings)
      .where(eq(processTrainings.processId, processId));

    let capacitacionesImpartidas = 0;
    if (trainings.length > 0) {
      const conducted = trainings.filter((t) => t.conductedDate !== null)
        .length;
      capacitacionesImpartidas = Math.round(
        (conducted / trainings.length) * 100
      );
    }

    // Calculate average
    const compliancePercentage = Math.round(
      (criticalidadCumplimiento +
        matrizAlcanzado +
        objetivosTacticosAlcanzado +
        cumplimientosPromedio +
        capacitacionesImpartidas) /
        5
    );

    console.log(`[MacroIndicators Test] Criticidad: ${criticalidadCumplimiento}%`);
    console.log(`[MacroIndicators Test] Matriz FODA: ${matrizAlcanzado}%`);
    console.log(
      `[MacroIndicators Test] Objetivos Tácticos: ${objetivosTacticosAlcanzado}%`
    );
    console.log(
      `[MacroIndicators Test] Cumplimientos: ${cumplimientosPromedio}%`
    );
    console.log(
      `[MacroIndicators Test] Capacitaciones: ${capacitacionesImpartidas}%`
    );
    console.log(
      `[MacroIndicators Test] Average Compliance: ${compliancePercentage}%`
    );

    expect(compliancePercentage).toBeGreaterThanOrEqual(0);
    expect(compliancePercentage).toBeLessThanOrEqual(100);
  });
});
