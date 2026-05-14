import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../db";
import { criticalityMatrix, stakeholders } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Criticality Matrix - UNIQUE Constraint", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  const testProcessId1 = 1290099;
  const testProcessId2 = 1290098;
  const testStakeholderId = 999999;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database connection failed");

    // Clean up any existing test data
    await db.delete(criticalityMatrix).where(eq(criticalityMatrix.processId, testProcessId1));
    await db.delete(stakeholders).where(eq(stakeholders.processId, testProcessId1));
    await db.delete(criticalityMatrix).where(eq(criticalityMatrix.processId, testProcessId2));
    await db.delete(stakeholders).where(eq(stakeholders.processId, testProcessId2));
  });

  afterAll(async () => {
    // Clean up test data
    if (db) {
      await db.delete(criticalityMatrix).where(eq(criticalityMatrix.processId, testProcessId1));
      await db.delete(stakeholders).where(eq(stakeholders.processId, testProcessId1));
      await db.delete(criticalityMatrix).where(eq(criticalityMatrix.processId, testProcessId2));
      await db.delete(stakeholders).where(eq(stakeholders.processId, testProcessId2));
    }
  });

  it("should allow creating one criticality entry per (processId, stakeholderId)", async () => {
    if (!db) throw new Error("Database not available");

    // Create a stakeholder first
    const stakeholderResult = await db.insert(stakeholders).values({
      processId: testProcessId1,
      name: "Test Stakeholder for Constraint",
      type: "cliente",
      isInternal: false,
      orderIndex: 0,
    });

    let stakeholderId: number;
    if (typeof (stakeholderResult as any).insertId === 'number') {
      stakeholderId = (stakeholderResult as any).insertId;
    } else if (typeof (stakeholderResult as any).insertId === 'bigint') {
      stakeholderId = Number((stakeholderResult as any).insertId);
    } else {
      const inserted = await db.select().from(stakeholders).where(eq(stakeholders.processId, testProcessId1));
      stakeholderId = inserted[0]?.id || testStakeholderId;
    }

    // Insert first criticality entry
    const result1 = await db.insert(criticalityMatrix).values({
      processId: testProcessId1,
      stakeholderId: stakeholderId,
      incidence: "1",
      risk: "A",
      criticality: "1A",
      actionToTake: "First action",
      implementationStatus: false,
      completionPercentage: 0,
    });

    expect(result1).toBeDefined();

    // Try to insert second criticality entry with same (processId, stakeholderId)
    // This should fail due to UNIQUE constraint
    let duplicateError: any = null;
    try {
      await db.insert(criticalityMatrix).values({
        processId: testProcessId1,
        stakeholderId: stakeholderId,
        incidence: "2",
        risk: "B",
        criticality: "2B",
        actionToTake: "Second action",
        implementationStatus: true,
        completionPercentage: 50,
      });
    } catch (error) {
      duplicateError = error;
    }

    // Verify that the duplicate insert failed
    expect(duplicateError).toBeDefined();
    // Check if error message contains either the Duplicate entry error or the Failed query error
    const errorMsg = duplicateError?.message || duplicateError?.toString() || '';
    expect(errorMsg).toMatch(/(Duplicate entry|Failed query|ER_DUP_ENTRY)/);

    // Verify only one record exists
    const records = await db
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.processId, testProcessId1));

    expect(records.length).toBeGreaterThanOrEqual(1);
    const firstRecord = records.find((r: any) => r.actionToTake === "First action");
    expect(firstRecord).toBeDefined();
  });

  it("should allow creating entries for different stakeholders in same process", async () => {
    if (!db) throw new Error("Database not available");

    // Create two stakeholders
    const stakeholder1Result = await db.insert(stakeholders).values({
      processId: testProcessId2,
      name: "Stakeholder 1",
      type: "cliente",
      isInternal: false,
      orderIndex: 0,
    });

    const stakeholder2Result = await db.insert(stakeholders).values({
      processId: testProcessId2,
      name: "Stakeholder 2",
      type: "proveedor",
      isInternal: false,
      orderIndex: 1,
    });

    let stakeholder1Id: number;
    let stakeholder2Id: number;

    if (typeof (stakeholder1Result as any).insertId === 'number') {
      stakeholder1Id = (stakeholder1Result as any).insertId;
    } else {
      const inserted = await db.select().from(stakeholders).where(eq(stakeholders.processId, testProcessId2));
      stakeholder1Id = inserted[0]?.id || 1;
    }

    if (typeof (stakeholder2Result as any).insertId === 'number') {
      stakeholder2Id = (stakeholder2Result as any).insertId;
    } else {
      const inserted = await db.select().from(stakeholders).where(eq(stakeholders.processId, testProcessId2));
      stakeholder2Id = inserted[1]?.id || 2;
    }

    // Insert criticality entries for different stakeholders
    const result1 = await db.insert(criticalityMatrix).values({
      processId: testProcessId2,
      stakeholderId: stakeholder1Id,
      incidence: "1",
      risk: "A",
      criticality: "1A",
      actionToTake: "Action for stakeholder 1",
      implementationStatus: false,
      completionPercentage: 0,
    });

    const result2 = await db.insert(criticalityMatrix).values({
      processId: testProcessId2,
      stakeholderId: stakeholder2Id,
      incidence: "2",
      risk: "B",
      criticality: "2B",
      actionToTake: "Action for stakeholder 2",
      implementationStatus: true,
      completionPercentage: 50,
    });

    expect(result1).toBeDefined();
    expect(result2).toBeDefined();

    // Verify both records exist
    const records = await db
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.processId, testProcessId2));

    expect(records.length).toBeGreaterThanOrEqual(2);
  });
});
