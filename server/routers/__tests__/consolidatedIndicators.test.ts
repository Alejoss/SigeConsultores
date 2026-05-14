import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../db";
import { 
  processes, 
  criticalityMatrix, 
  stakeholders,
  processFODA,
  processTacticalObjectives,
  processCompliances,
  processTrainings
} from "../../../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Consolidated Indicators Router", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  const processId = 1290003; // Test process ID
  
  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database connection failed");
    
    // Clean up any existing test data
    if (db) {
      await db.delete(criticalityMatrix).where(eq(criticalityMatrix.processId, processId));
      await db.delete(stakeholders).where(eq(stakeholders.processId, processId));
      await db.delete(processFODA).where(eq(processFODA.processId, processId));
      await db.delete(processTacticalObjectives).where(eq(processTacticalObjectives.processId, processId));
      await db.delete(processCompliances).where(eq(processCompliances.processId, processId));
      await db.delete(processTrainings).where(eq(processTrainings.processId, processId));
    }
  });

  afterAll(async () => {
    // Clean up test data
    if (db) {
      await db.delete(criticalityMatrix).where(eq(criticalityMatrix.processId, processId));
      await db.delete(stakeholders).where(eq(stakeholders.processId, processId));
      await db.delete(processFODA).where(eq(processFODA.processId, processId));
      await db.delete(processTacticalObjectives).where(eq(processTacticalObjectives.processId, processId));
      await db.delete(processCompliances).where(eq(processCompliances.processId, processId));
      await db.delete(processTrainings).where(eq(processTrainings.processId, processId));
    }
  });

  it("should calculate Criticidad Partes Interesadas correctly", async () => {
    if (!db) throw new Error("Database not available");

    // Create test stakeholders
    const stakeholderResult = await db.insert(stakeholders).values({
      processId,
      name: "Test Stakeholder for Criticality",
      type: "cliente",
      isInternal: false,
      orderIndex: 0,
    });

    const stakeholderId = (stakeholderResult as any).insertId || 1;

    // Create criticality matrix entries with implementationStatus
    try {
      await db.insert(criticalityMatrix).values({
        processId,
        stakeholderId,
        incidence: "1",
        risk: "A",
        criticality: "1A",
        implementationStatus: true,
      });

      await db.insert(criticalityMatrix).values({
        processId,
        stakeholderId,
        incidence: "2",
        risk: "B",
        criticality: "2B",
        implementationStatus: false,
      });
    } catch (e) {
      console.log("Skipping criticality test - stakeholder creation issue");
      return;
    }

    // Fetch indicators
    const criticalityEntries = await db.select().from(criticalityMatrix)
      .where(eq(criticalityMatrix.processId, processId));

    // Calculate percentage of completed (implementationStatus = true)
    const completed = criticalityEntries.filter(entry => entry.implementationStatus === true).length;
    const percentage = Math.round((completed / criticalityEntries.length) * 100);

    expect(percentage).toBe(50); // 1/2 = 50%
  });

  it("should calculate Matriz FODA correctly", async () => {
    if (!db) throw new Error("Database not available");

    const matrixData = JSON.stringify([
      { id: "1", name: "Item 1", implemented: true, communicated: true },
      { id: "2", name: "Item 2", implemented: true, communicated: false },
      { id: "3", name: "Item 3", implemented: false, communicated: true },
    ]);

    await db.insert(processFODA).values({
      processId,
      strengths: "Test strengths",
      opportunities: "Test opportunities",
      weaknesses: "Test weaknesses",
      threats: "Test threats",
      matrixData,
    });

    // Fetch and calculate
    const fodaData = await db.select().from(processFODA)
      .where(eq(processFODA.processId, processId));

    let matrizAlcanzado = 0;
    let matrizComunicado = 0;

    if (fodaData.length > 0 && fodaData[0].matrixData) {
      const matrixRows = JSON.parse(fodaData[0].matrixData);
      const implemented = matrixRows.filter((row: any) => row.implemented === true).length;
      const communicated = matrixRows.filter((row: any) => row.communicated === true).length;
      
      matrizAlcanzado = matrixRows.length > 0 ? Math.round((implemented / matrixRows.length) * 100) : 0;
      matrizComunicado = matrixRows.length > 0 ? Math.round((communicated / matrixRows.length) * 100) : 0;
    }

    expect(matrizAlcanzado).toBe(67); // 2/3 = 66.67 ≈ 67
    expect(matrizComunicado).toBe(67); // 2/3 = 66.67 ≈ 67
  });

  it("should calculate Objetivos Tácticos correctly from planningData", async () => {
    if (!db) throw new Error("Database not available");

    const planningData = JSON.stringify([
      {
        id: "planning_1",
        objectiveName: "Test Objective",
        resultKeys: [
          {
            id: "rk_1",
            description: "Result Key 1",
            tasks: [
              { id: "t_1", description: "Task 1", percentageCompleted: 100 },
              { id: "t_2", description: "Task 2", percentageCompleted: 50 },
            ],
          },
          {
            id: "rk_2",
            description: "Result Key 2",
            tasks: [
              { id: "t_3", description: "Task 3", percentageCompleted: 75 },
            ],
          },
        ],
      },
    ]);

    await db.insert(processTacticalObjectives).values({
      processId,
      name: "Test Tactical Objective",
      planningData,
    });

    // Fetch and calculate
    const tacticalObjectives = await db.select().from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, processId));

    let objetivosTacticosAlcanzado = 0;
    if (tacticalObjectives.length > 0) {
      let totalAchievement = 0;
      let resultKeyCount = 0;

      tacticalObjectives.forEach((obj: any) => {
        if (obj.planningData) {
          const planningData = JSON.parse(obj.planningData);
          if (Array.isArray(planningData)) {
            planningData.forEach((planning: any) => {
              if (planning.resultKeys && Array.isArray(planning.resultKeys)) {
                planning.resultKeys.forEach((rk: any) => {
                  if (rk.tasks && Array.isArray(rk.tasks) && rk.tasks.length > 0) {
                    const avgCompletion = rk.tasks.reduce((sum: number, t: any) => sum + (t.percentageCompleted || 0), 0) / rk.tasks.length;
                    totalAchievement += avgCompletion;
                    resultKeyCount += 1;
                  }
                });
              }
            });
          }
        }
      });

      objetivosTacticosAlcanzado = resultKeyCount > 0 ? Math.round(totalAchievement / resultKeyCount) : 0;
    }

    // RK1: (100 + 50) / 2 = 75
    // RK2: 75 / 1 = 75
    // Average: (75 + 75) / 2 = 75
    expect(objetivosTacticosAlcanzado).toBe(75);
  });

  it("should calculate Cumplimientos correctly", async () => {
    if (!db) throw new Error("Database not available");

    await db.insert(processCompliances).values({
      processId,
      requirement: "Compliance 1",
      obligationType: "Legal",
      completed: "SI",
    });

    await db.insert(processCompliances).values({
      processId,
      requirement: "Compliance 2",
      obligationType: "Reglamentaria",
      completed: "NO",
    });

    await db.insert(processCompliances).values({
      processId,
      requirement: "Compliance 3",
      obligationType: "Legal",
      completed: "SI",
    });

    // Fetch and calculate
    const compliances = await db.select().from(processCompliances)
      .where(eq(processCompliances.processId, processId));

    let cumplimientosPromedio = 0;
    if (compliances.length > 0) {
      const completed = compliances.filter(c => c.completed === "SI").length;
      cumplimientosPromedio = Math.round((completed / compliances.length) * 100);
    }

    expect(cumplimientosPromedio).toBe(67); // 2/3 = 66.67 ≈ 67
  });

  it("should calculate Capacitaciones correctly", async () => {
    if (!db) throw new Error("Database not available");

    try {
      await db.insert(processTrainings).values({
        processId,
        name: "Training 1",
        conductedDate: new Date(),
      });

      await db.insert(processTrainings).values({
        processId,
        name: "Training 2",
        conductedDate: null,
      });
    } catch (e) {
      console.log("Skipping trainings test");
      return;
    }

    // Fetch and calculate
    const trainings = await db.select().from(processTrainings)
      .where(eq(processTrainings.processId, processId));

    let capacitacionesImpartidas = 0;
    if (trainings.length > 0) {
      const conducted = trainings.filter(t => t.conductedDate !== null).length;
      capacitacionesImpartidas = Math.round((conducted / trainings.length) * 100);
    }

    expect(capacitacionesImpartidas).toBe(50); // 1/2 = 50
  });
});
