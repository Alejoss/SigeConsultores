import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { processTacticalObjectives } from "../../drizzle/schema";

describe("Consolidated Indicators - Meta Alcanzada", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let processId: number;

  beforeEach(async () => {
    db = await getDb();
    processId = 900_000 + Math.floor(Math.random() * 100_000);
  });

  afterEach(async () => {
    if (db) {
      await db
        .delete(processTacticalObjectives)
        .where(eq(processTacticalObjectives.processId, processId));
    }
  });

  it("should extract metaAlcanzada from planningData", async () => {
    if (!db) {
      console.warn("Database not available, skipping test");
      return;
    }

    const planningData = {
      category: "test",
      goal: "test goal",
      metaAlcanzada: -11,
      resultKeys: [],
    };

    await db.insert(processTacticalObjectives).values({
      processId,
      name: "Test Objective",
      description: "Test Description",
      planningData: JSON.stringify(planningData),
    });

    const objectives = await db
      .select()
      .from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, processId));

    expect(objectives.length).toBe(1);

    const parsed = JSON.parse(objectives[0].planningData!);
    expect(parsed.metaAlcanzada).toBe(-11);
  });

  it("should calculate average metaAlcanzada across multiple objectives", async () => {
    if (!db) {
      console.warn("Database not available, skipping test");
      return;
    }

    const metaValues = [10, 20, 30];

    for (let i = 0; i < metaValues.length; i++) {
      const planningData = {
        category: "test",
        goal: "test goal",
        metaAlcanzada: metaValues[i],
        resultKeys: [],
      };

      await db.insert(processTacticalObjectives).values({
        processId,
        name: `Test Objective ${i}`,
        description: "Test Description",
        planningData: JSON.stringify(planningData),
      });
    }

    const fetchedObjectives = await db
      .select()
      .from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, processId));

    expect(fetchedObjectives.length).toBe(3);

    let totalMetaAlcanzada = 0;
    fetchedObjectives.forEach((obj) => {
      const parsed = JSON.parse(obj.planningData!);
      totalMetaAlcanzada += parsed.metaAlcanzada || 0;
    });

    const average = Math.round(totalMetaAlcanzada / fetchedObjectives.length);
    expect(average).toBe(20);
  });

  it("should handle missing metaAlcanzada gracefully", async () => {
    if (!db) {
      console.warn("Database not available, skipping test");
      return;
    }

    const planningData = {
      category: "test",
      goal: "test goal",
      resultKeys: [],
    };

    await db.insert(processTacticalObjectives).values({
      processId,
      name: "Test Objective",
      description: "Test Description",
      planningData: JSON.stringify(planningData),
    });

    const objectives = await db
      .select()
      .from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, processId));

    expect(objectives.length).toBe(1);

    const parsed = JSON.parse(objectives[0].planningData!);
    const metaAlcanzada = parsed.metaAlcanzada || 0;
    expect(metaAlcanzada).toBe(0);
  });

  it("should handle negative metaAlcanzada values", async () => {
    if (!db) {
      console.warn("Database not available, skipping test");
      return;
    }

    const planningData = {
      category: "test",
      goal: "test goal",
      metaAlcanzada: -11,
      resultKeys: [],
    };

    await db.insert(processTacticalObjectives).values({
      processId,
      name: "Test Objective",
      description: "Test Description",
      planningData: JSON.stringify(planningData),
    });

    const objectives = await db
      .select()
      .from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, processId));

    expect(objectives.length).toBe(1);

    const parsed = JSON.parse(objectives[0].planningData!);
    expect(parsed.metaAlcanzada).toBe(-11);
  });
});
