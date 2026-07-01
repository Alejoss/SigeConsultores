import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { criticalityMatrix, stakeholders } from "../../drizzle/schema";
import { describeWithDb } from "./helpers/db";

const TEST_PROCESS_ID = 1290028;

describeWithDb("Criticality Matrix integrity", () => {
  let db: Awaited<ReturnType<typeof getDb>>;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database connection failed");
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(criticalityMatrix).where(eq(criticalityMatrix.processId, TEST_PROCESS_ID));
    await db.delete(stakeholders).where(eq(stakeholders.processId, TEST_PROCESS_ID));
  });

  it("should have no duplicate (processId, stakeholderId) pairs", async () => {
    if (!db) throw new Error("Database not available");

    const duplicates = await db
      .select({
        processId: criticalityMatrix.processId,
        stakeholderId: criticalityMatrix.stakeholderId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(criticalityMatrix)
      .groupBy(criticalityMatrix.processId, criticalityMatrix.stakeholderId)
      .having(sql`count(*) > 1`);

    expect(duplicates).toHaveLength(0);
  });

  it("should enforce one criticality row per stakeholder in a process", async () => {
    if (!db) throw new Error("Database not available");

    await db.delete(criticalityMatrix).where(eq(criticalityMatrix.processId, TEST_PROCESS_ID));
    await db.delete(stakeholders).where(eq(stakeholders.processId, TEST_PROCESS_ID));

    const stakeholderNames = ["Integrity A", "Integrity B", "Integrity C"];
    const stakeholderIds: number[] = [];

    for (const [index, name] of stakeholderNames.entries()) {
      const result = await db.insert(stakeholders).values({
        processId: TEST_PROCESS_ID,
        name,
        type: "cliente",
        isInternal: false,
        orderIndex: index,
      });
      const insertId = Number((result as { insertId?: number | bigint }).insertId ?? 0);
      if (insertId) {
        stakeholderIds.push(insertId);
      } else {
        const rows = await db
          .select()
          .from(stakeholders)
          .where(eq(stakeholders.processId, TEST_PROCESS_ID));
        stakeholderIds.push(rows[rows.length - 1]!.id);
      }
    }

    expect(stakeholderIds).toHaveLength(3);

    const endDate = new Date("2026-04-30T12:00:00.000Z");
    for (const stakeholderId of stakeholderIds) {
      await db.insert(criticalityMatrix).values({
        processId: TEST_PROCESS_ID,
        stakeholderId,
        incidence: "1",
        risk: "A",
        criticality: "1A",
        actionToTake: "Test action",
        endDate,
      });
    }

    const rows = await db
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.processId, TEST_PROCESS_ID));

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.actionToTake && row.actionToTake.length > 0)).toBe(true);

    const monthCounts = await db
      .select({
        year: sql<number>`YEAR(${criticalityMatrix.endDate})`.mapWith(Number),
        month: sql<number>`MONTH(${criticalityMatrix.endDate})`.mapWith(Number),
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.processId, TEST_PROCESS_ID))
      .groupBy(
        sql`YEAR(${criticalityMatrix.endDate})`,
        sql`MONTH(${criticalityMatrix.endDate})`
      );

    const april2026 = monthCounts.filter((entry) => entry.year === 2026 && entry.month === 4);
    expect(april2026).toHaveLength(1);
    expect(april2026[0]?.count).toBe(3);

    const mayJune2026 = monthCounts.filter(
      (entry) => entry.year === 2026 && (entry.month === 5 || entry.month === 6)
    );
    expect(mayJune2026).toHaveLength(0);
  });
});
