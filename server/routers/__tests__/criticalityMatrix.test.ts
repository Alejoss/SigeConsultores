import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../db";
import { criticalityMatrix, stakeholders } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";

describe("Criticality Matrix Router", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  const processId = 1290002;
  const testStakeholderName = "Test Criticality Matrix Stakeholder";

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database connection failed");

    // Clean up all test records from previous runs
    if (db) {
      const testNames = [
        testStakeholderName,
        "Test Update Criticality Stakeholder",
        "Test Consolidate Criticality Stakeholder",
        "Test Null Fields Criticality Stakeholder",
      ];

      for (const name of testNames) {
        const stakeholderRecords = await db
          .select()
          .from(stakeholders)
          .where(
            and(
              eq(stakeholders.processId, processId),
              eq(stakeholders.name, name)
            )
          );

        for (const record of stakeholderRecords) {
          await db
            .delete(criticalityMatrix)
            .where(eq(criticalityMatrix.stakeholderId, record.id));
        }

        // Delete stakeholder records
        await db
          .delete(stakeholders)
          .where(
            and(
              eq(stakeholders.processId, processId),
              eq(stakeholders.name, name)
            )
          );
      }
    }
  });

  afterAll(async () => {
    // Clean up all test records
    if (db) {
      const testNames = [
        testStakeholderName,
        "Test Update Criticality Stakeholder",
        "Test Consolidate Criticality Stakeholder",
        "Test Null Fields Criticality Stakeholder",
      ];

      for (const name of testNames) {
        const stakeholderRecords = await db
          .select()
          .from(stakeholders)
          .where(
            and(
              eq(stakeholders.processId, processId),
              eq(stakeholders.name, name)
            )
          );

        for (const record of stakeholderRecords) {
          await db
            .delete(criticalityMatrix)
            .where(eq(criticalityMatrix.stakeholderId, record.id));
        }

        // Delete stakeholder records
        await db
          .delete(stakeholders)
          .where(
            and(
              eq(stakeholders.processId, processId),
              eq(stakeholders.name, name)
            )
          );
      }
    }
  });

  it("should insert a new criticality matrix entry with action data", async () => {
    if (!db) throw new Error("Database not available");

    // First create a stakeholder
    await db.insert(stakeholders).values({
      processId,
      name: testStakeholderName,
      type: "cliente",
      isInternal: false,
      orderIndex: 0,
    });

    // Get the stakeholder ID
    const stakeholderRecords = await db
      .select()
      .from(stakeholders)
      .where(
        and(
          eq(stakeholders.processId, processId),
          eq(stakeholders.name, testStakeholderName)
        )
      );

    expect(stakeholderRecords).toHaveLength(1);
    const stakeholderId = stakeholderRecords[0].id;

    // Insert a criticality matrix entry
    await db.insert(criticalityMatrix).values({
      processId,
      stakeholderId,
      incidence: "2",
      risk: "B",
      criticality: "4B",
      existingDefenses: "Control de calidad",
      actionToTake: "Implementar proceso de validación",
      observations: "Test observation",
      startDate: new Date("2026-03-13"),
      endDate: new Date("2026-04-14"),
      implementationStatus: false,
      completionPercentage: 0,
    });

    // Verify the record was inserted
    const records = await db
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.stakeholderId, stakeholderId));

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.actionToTake).toBe("Implementar proceso de validación");
    expect(record.startDate).toBeDefined();
    expect(record.endDate).toBeDefined();
    expect(record.criticality).toBe("4B");
  });

  it("should update an existing criticality matrix entry", async () => {
    if (!db) throw new Error("Database not available");

    const updateStakeholderName = "Test Update Criticality Stakeholder";

    // Create a stakeholder
    await db.insert(stakeholders).values({
      processId,
      name: updateStakeholderName,
      type: "proveedor",
      isInternal: true,
      orderIndex: 0,
    });

    // Get the stakeholder ID
    const stakeholderRecords = await db
      .select()
      .from(stakeholders)
      .where(
        and(
          eq(stakeholders.processId, processId),
          eq(stakeholders.name, updateStakeholderName)
        )
      );

    const stakeholderId = stakeholderRecords[0].id;

    // Insert a criticality matrix entry
    await db.insert(criticalityMatrix).values({
      processId,
      stakeholderId,
      incidence: "1",
      risk: "A",
      criticality: "3A",
      existingDefenses: "Auditoría",
      actionToTake: "Original action",
      observations: "Original observation",
      startDate: new Date("2026-03-01"),
      endDate: new Date("2026-03-31"),
      implementationStatus: false,
      completionPercentage: 0,
    });

    // Get the criticality matrix record ID
    const originalRecords = await db
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.stakeholderId, stakeholderId));

    expect(originalRecords).toHaveLength(1);
    const recordId = originalRecords[0].id;

    // Update the record
    await db
      .update(criticalityMatrix)
      .set({
        actionToTake: "Updated action",
        startDate: new Date("2026-03-15"),
        endDate: new Date("2026-04-15"),
        implementationStatus: true,
        completionPercentage: 50,
      })
      .where(eq(criticalityMatrix.id, recordId));

    // Verify the update
    const updatedRecords = await db
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.id, recordId));

    expect(updatedRecords).toHaveLength(1);
    const updated = updatedRecords[0];
    expect(updated.actionToTake).toBe("Updated action");
    expect(updated.startDate).toBeDefined();
    expect(updated.endDate).toBeDefined();
    expect(updated.implementationStatus).toBe(true);
    expect(updated.completionPercentage).toBe(50);

    // Clean up
    await db
      .delete(criticalityMatrix)
      .where(eq(criticalityMatrix.id, recordId));

    await db
      .delete(stakeholders)
      .where(eq(stakeholders.id, stakeholderId));
  });

  it("should retrieve criticality matrix entries for consolidated schedule", async () => {
    if (!db) throw new Error("Database not available");

    const consolidateTestName = "Test Consolidate Criticality Stakeholder";

    // Create a stakeholder
    await db.insert(stakeholders).values({
      processId,
      name: consolidateTestName,
      type: "cliente",
      isInternal: false,
      orderIndex: 0,
    });

    // Get the stakeholder ID
    const stakeholderRecords = await db
      .select()
      .from(stakeholders)
      .where(
        and(
          eq(stakeholders.processId, processId),
          eq(stakeholders.name, consolidateTestName)
        )
      );

    const stakeholderId = stakeholderRecords[0].id;

    // Insert a criticality matrix entry
    await db.insert(criticalityMatrix).values({
      processId,
      stakeholderId,
      incidence: "3",
      risk: "A",
      criticality: "9A",
      existingDefenses: "Control",
      actionToTake: "Acción 1",
      observations: "Obs 1",
      startDate: new Date("2026-03-13"),
      endDate: new Date("2026-04-14"),
      implementationStatus: false,
      completionPercentage: 0,
    });

    // Query for consolidation
    const records = await db
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.stakeholderId, stakeholderId));

    expect(records.length).toBeGreaterThan(0);
    const record = records[records.length - 1]; // Get the last one

    // Verify all fields needed for consolidation are present
    expect(record.actionToTake).toBe("Acción 1");
    expect(record.startDate).toBeDefined();
    expect(record.endDate).toBeDefined();
    expect(record.criticality).toBe("9A");

    // Clean up - delete all criticality records for this stakeholder
    await db
      .delete(criticalityMatrix)
      .where(eq(criticalityMatrix.stakeholderId, stakeholderId));

    await db
      .delete(stakeholders)
      .where(eq(stakeholders.id, stakeholderId));
  });

  it("should handle NULL values for optional action fields", async () => {
    if (!db) throw new Error("Database not available");

    const nullTestName = "Test Null Fields Criticality Stakeholder";

    // Create a stakeholder
    await db.insert(stakeholders).values({
      processId,
      name: nullTestName,
      type: "cliente",
      isInternal: false,
      orderIndex: 0,
    });

    // Get the stakeholder ID
    const stakeholderRecords = await db
      .select()
      .from(stakeholders)
      .where(
        and(
          eq(stakeholders.processId, processId),
          eq(stakeholders.name, nullTestName)
        )
      );

    const stakeholderId = stakeholderRecords[0].id;

    // Insert with NULL action fields
    await db.insert(criticalityMatrix).values({
      processId,
      stakeholderId,
      incidence: "1",
      risk: "C",
      criticality: "1C",
      existingDefenses: "Documentación",
      actionToTake: null,
      observations: null,
      startDate: null,
      endDate: null,
      implementationStatus: false,
      completionPercentage: 0,
    });

    // Verify NULL values are preserved
    const records = await db
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.stakeholderId, stakeholderId));

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.actionToTake).toBeNull();
    expect(record.startDate).toBeNull();
    expect(record.endDate).toBeNull();

    // Clean up
    const recordId = record.id;
    await db
      .delete(criticalityMatrix)
      .where(eq(criticalityMatrix.id, recordId));

    await db
      .delete(stakeholders)
      .where(eq(stakeholders.id, stakeholderId));
  });
});
