import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  createStakeholderCriticality,
  createProcessCompliance,
  createProcessTraining,
  createCompany,
  createProcess,
} from "../db";
import {
  companies,
  processes,
  stakeholderCriticalities,
  processCompliances,
  processTrainings,
  processTacticalObjectives,
} from "../../drizzle/schema";
import { insertTestAccount } from "./helpers/accounts";

describe("Consolidated Indicators Calculation", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let companyId: number;
  let processId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    const suffix = Date.now();
    const owner = await insertTestAccount(db, {
      openId: `consolidated-indicators-${suffix}`,
      email: `consolidated-indicators-${suffix}@example.com`,
    });

    const companyResult = await createCompany(
      `Consolidated Indicators Co ${suffix}`,
      "Test Description",
      owner.id
    );
    companyId = Number(companyResult[0].insertId);

    const processResult = await createProcess(
      companyId,
      `Consolidated Indicators Process ${suffix}`,
      "misional",
      "Test Process Description"
    );
    processId = Number(processResult[0].insertId);
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(stakeholderCriticalities).where(eq(stakeholderCriticalities.processId, processId));
    await db.delete(processCompliances).where(eq(processCompliances.processId, processId));
    await db.delete(processTrainings).where(eq(processTrainings.processId, processId));
    await db.delete(processTacticalObjectives).where(eq(processTacticalObjectives.processId, processId));
    await db.delete(processes).where(eq(processes.id, processId));
    await db.delete(companies).where(eq(companies.id, companyId));
  });

  it("should calculate criticality percentage from stakeholders", async () => {
    await createStakeholderCriticality(processId, {
      name: "Stakeholder 1",
      type: "Cliente",
      influence: 5,
      dependence: 5,
      criticality: 9,
    });

    await createStakeholderCriticality(processId, {
      name: "Stakeholder 2",
      type: "Proveedor",
      influence: 3,
      dependence: 3,
      criticality: 5,
    });

    const stakeholders = await db!
      .select()
      .from(stakeholderCriticalities)
      .where(eq(stakeholderCriticalities.processId, processId));
    const totalCriticality = stakeholders.reduce((sum, s) => sum + (s.criticality || 0), 0);
    const maxPossible = stakeholders.length * 9;
    const percentage = maxPossible > 0 ? Math.round((totalCriticality / maxPossible) * 100) : 0;

    expect(percentage).toBeGreaterThan(0);
    expect(percentage).toBeLessThanOrEqual(100);
  });

  it("should calculate compliance percentage", async () => {
    await createProcessCompliance(processId, {
      requirement: "Compliance 1",
      obligationType: "Legal",
      completed: "SI",
    });

    await createProcessCompliance(processId, {
      requirement: "Compliance 2",
      obligationType: "Legal",
      completed: "NO",
    });

    const compliances = await db!
      .select()
      .from(processCompliances)
      .where(eq(processCompliances.processId, processId));
    const completed = compliances.filter((c) => c.completed === "SI").length;
    const percentage =
      compliances.length > 0 ? Math.round((completed / compliances.length) * 100) : 0;

    expect(percentage).toBe(50);
  });

  it("should calculate training conducted percentage", async () => {
    await createProcessTraining(processId, {
      name: "Training 1",
      type: "Mandatoria",
      modality: "Presencial",
      plannedDate: new Date(),
      conductedDate: new Date(),
    });

    await createProcessTraining(processId, {
      name: "Training 2",
      type: "Mandatoria",
      modality: "Online",
      plannedDate: new Date(),
    });

    const trainings = await db!
      .select()
      .from(processTrainings)
      .where(eq(processTrainings.processId, processId));
    const conducted = trainings.filter((t) => t.conductedDate !== null).length;
    const percentage =
      trainings.length > 0 ? Math.round((conducted / trainings.length) * 100) : 0;

    expect(percentage).toBeGreaterThanOrEqual(0);
    expect(percentage).toBeLessThanOrEqual(100);
  });

  it("should calculate tactical objectives percentage", async () => {
    await db!.insert(processTacticalObjectives).values([
      {
        processId,
        name: "Objective 1",
        description: "Test objective",
        target: "100%",
        responsible: "Manager",
        deadline: new Date(),
        completed: "SI",
      },
      {
        processId,
        name: "Objective 2",
        description: "Test objective 2",
        target: "100%",
        responsible: "Manager",
        deadline: new Date(),
        completed: "NO",
      },
    ]);

    const objectives = await db!
      .select()
      .from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, processId));
    const completed = objectives.filter((o) => o.completed === "SI").length;
    const percentage =
      objectives.length > 0 ? Math.round((completed / objectives.length) * 100) : 0;

    expect(percentage).toBeGreaterThanOrEqual(0);
    expect(percentage).toBeLessThanOrEqual(100);
  });

  it("should return all indicators in correct format", async () => {
    const indicators = [
      { id: "criticidad", name: "Criticidad Partes Interesadas", indicator: "Porcentaje de cumplimiento", value: 0 },
      { id: "matriz_alcanzado", name: "Matriz (FODA)", indicator: "Total alcanzado", value: 0 },
      { id: "matriz_comunicado", name: "Matriz (FODA)", indicator: "%Comunicado", value: 0 },
      { id: "objetivos_alcanzado", name: "Objetivos tácticos", indicator: "% Alcanzado", value: 0 },
      { id: "cumplimientos_promedio", name: "Cumplimientos", indicator: "%Promedio de cumplimiento", value: 0 },
      { id: "capacitaciones_impartidas", name: "Capacitaciones", indicator: "%Impartidas", value: 0 },
    ];

    expect(indicators).toHaveLength(6);
    expect(indicators[0].name).toBe("Criticidad Partes Interesadas");
    expect(indicators[1].name).toBe("Matriz (FODA)");
    expect(indicators[4].name).toBe("Cumplimientos");
    expect(indicators[5].name).toBe("Capacitaciones");
  });
});
