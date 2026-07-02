import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { processTacticalObjectives } from "../../../drizzle/schema";

describe("Tactical Planning Data Persistence", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let processId: number;
  let testObjectiveId: number;

  beforeEach(async () => {
    db = await getDb();
    if (!db) {
      throw new Error("Database not available for testing");
    }

    processId = 900_000 + Math.floor(Math.random() * 100_000);

    const result = await db.insert(processTacticalObjectives).values({
      processId,
      name: "Test Objective",
      description: "Test Description",
      subprocess: "Test Subprocess",
      strategicObjective: "Test Strategic Objective",
      strategicObjectiveDescription: "Test Strategic Description",
      responsible: "Test Responsible",
      completed: "NO",
    });

    testObjectiveId = Number(result[0].insertId);
  });

  afterEach(async () => {
    if (db && testObjectiveId) {
      await db
        .delete(processTacticalObjectives)
        .where(eq(processTacticalObjectives.id, testObjectiveId));
    }
  });

  it("should save planning data to planningData column without overwriting strategicObjectiveDescription", async () => {
    const planningData = {
      category: "Test Category",
      goal: 100,
      resultKeys: ["Key1", "Key2", "Key3"],
    };

    await db!
      .update(processTacticalObjectives)
      .set({
        planningData: JSON.stringify(planningData),
        updatedAt: new Date(),
      })
      .where(eq(processTacticalObjectives.id, testObjectiveId));

    const updated = await db!
      .select()
      .from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.id, testObjectiveId));

    expect(updated).toHaveLength(1);
    const objective = updated[0];

    expect(objective.planningData).toBeDefined();
    const savedPlanning = JSON.parse(objective.planningData!);
    expect(savedPlanning.category).toBe("Test Category");
    expect(savedPlanning.goal).toBe(100);
    expect(savedPlanning.resultKeys).toEqual(["Key1", "Key2", "Key3"]);

    expect(objective.strategicObjectiveDescription).toBe("Test Strategic Description");
  });

  it("should load planning data from planningData column correctly", async () => {
    const planningData = {
      category: "Planning Category",
      goal: 250,
      resultKeys: ["Result1", "Result2"],
    };

    await db!
      .update(processTacticalObjectives)
      .set({
        planningData: JSON.stringify(planningData),
      })
      .where(eq(processTacticalObjectives.id, testObjectiveId));

    const objectives = await db!
      .select()
      .from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.id, testObjectiveId));

    expect(objectives).toHaveLength(1);
    const objective = objectives[0];

    const loadedPlanning = objective.planningData
      ? JSON.parse(objective.planningData)
      : { category: "", goal: 0, resultKeys: [] };

    expect(loadedPlanning.category).toBe("Planning Category");
    expect(loadedPlanning.goal).toBe(250);
    expect(loadedPlanning.resultKeys).toEqual(["Result1", "Result2"]);
  });

  it("should handle empty planningData gracefully", async () => {
    const objectives = await db!
      .select()
      .from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.id, testObjectiveId));

    expect(objectives).toHaveLength(1);
    const objective = objectives[0];

    const loadedPlanning = objective.planningData
      ? JSON.parse(objective.planningData)
      : { category: "", goal: 0, resultKeys: [] };

    expect(loadedPlanning.category).toBe("");
    expect(loadedPlanning.goal).toBe(0);
    expect(loadedPlanning.resultKeys).toEqual([]);
  });

  it("should preserve both strategicObjectiveDescription and planningData independently", async () => {
    const strategicDesc = "Original Strategic Description";
    const planningData = {
      category: "Independent Category",
      goal: 500,
      resultKeys: ["Independent1"],
    };

    await db!
      .update(processTacticalObjectives)
      .set({
        strategicObjectiveDescription: strategicDesc,
        planningData: JSON.stringify(planningData),
      })
      .where(eq(processTacticalObjectives.id, testObjectiveId));

    const updated = await db!
      .select()
      .from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.id, testObjectiveId));

    expect(updated).toHaveLength(1);
    const objective = updated[0];

    expect(objective.strategicObjectiveDescription).toBe(strategicDesc);
    const savedPlanning = JSON.parse(objective.planningData!);
    expect(savedPlanning.category).toBe("Independent Category");
    expect(savedPlanning.goal).toBe(500);
  });
});
