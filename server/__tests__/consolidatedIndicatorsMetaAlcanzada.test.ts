import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDb } from "../db";
import { processTacticalObjectives } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Consolidated Indicators - Meta Alcanzada", () => {
  let db: any;
  let processId = 999;
  let objectiveId = 999;

  beforeEach(async () => {
    db = await getDb();
  });

  afterEach(async () => {
    if (db) {
      await db.delete(processTacticalObjectives).where(
        eq(processTacticalObjectives.processId, processId)
      );
    }
  });

  it("should extract metaAlcanzada from planningData", async () => {
    if (!db) {
      console.warn("Database not available, skipping test");
      return;
    }

    // Create a tactical objective with metaAlcanzada = -11
    const planningData = {
      category: "test",
      goal: "test goal",
      metaAlcanzada: -11,
      resultKeys: []
    };

    await db.insert(processTacticalObjectives).values({
      id: objectiveId,
      processId: processId,
      name: "Test Objective",
      description: "Test Description",
      planningData: JSON.stringify(planningData),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Fetch the objective
    const objectives = await db.select().from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, processId));

    expect(objectives.length).toBe(1);
    
    // Parse planningData and check metaAlcanzada
    const parsed = JSON.parse(objectives[0].planningData);
    expect(parsed.metaAlcanzada).toBe(-11);
  });

  it("should calculate average metaAlcanzada across multiple objectives", async () => {
    if (!db) {
      console.warn("Database not available, skipping test");
      return;
    }

    // Create multiple objectives with different metaAlcanzada values
    const objectives = [
      { metaAlcanzada: 10 },
      { metaAlcanzada: 20 },
      { metaAlcanzada: 30 }
    ];

    for (let i = 0; i < objectives.length; i++) {
      const planningData = {
        category: "test",
        goal: "test goal",
        metaAlcanzada: objectives[i].metaAlcanzada,
        resultKeys: []
      };

      await db.insert(processTacticalObjectives).values({
        id: objectiveId + i,
        processId: processId,
        name: `Test Objective ${i}`,
        description: "Test Description",
        planningData: JSON.stringify(planningData),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Fetch all objectives
    const fetchedObjectives = await db.select().from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, processId));

    expect(fetchedObjectives.length).toBe(3);

    // Calculate average
    let totalMetaAlcanzada = 0;
    fetchedObjectives.forEach((obj: any) => {
      const parsed = JSON.parse(obj.planningData);
      totalMetaAlcanzada += parsed.metaAlcanzada || 0;
    });

    const average = Math.round(totalMetaAlcanzada / fetchedObjectives.length);
    expect(average).toBe(20); // (10 + 20 + 30) / 3 = 20
  });

  it("should handle missing metaAlcanzada gracefully", async () => {
    if (!db) {
      console.warn("Database not available, skipping test");
      return;
    }

    // Create objective without metaAlcanzada
    const planningData = {
      category: "test",
      goal: "test goal",
      resultKeys: []
    };

    await db.insert(processTacticalObjectives).values({
      id: objectiveId,
      processId: processId,
      name: "Test Objective",
      description: "Test Description",
      planningData: JSON.stringify(planningData),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Fetch the objective
    const objectives = await db.select().from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, processId));

    expect(objectives.length).toBe(1);

    // Parse planningData - metaAlcanzada should default to 0
    const parsed = JSON.parse(objectives[0].planningData);
    const metaAlcanzada = parsed.metaAlcanzada || 0;
    expect(metaAlcanzada).toBe(0);
  });

  it("should handle negative metaAlcanzada values", async () => {
    if (!db) {
      console.warn("Database not available, skipping test");
      return;
    }

    // Create objective with negative metaAlcanzada
    const planningData = {
      category: "test",
      goal: "test goal",
      metaAlcanzada: -11,
      resultKeys: []
    };

    await db.insert(processTacticalObjectives).values({
      id: objectiveId,
      processId: processId,
      name: "Test Objective",
      description: "Test Description",
      planningData: JSON.stringify(planningData),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Fetch the objective
    const objectives = await db.select().from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, processId));

    expect(objectives.length).toBe(1);

    // Parse planningData
    const parsed = JSON.parse(objectives[0].planningData);
    expect(parsed.metaAlcanzada).toBe(-11);
  });
});
