import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getDb } from "../../db";
import { criticalityMatrix, stakeholders } from "../../../drizzle/schema";
import { and, eq } from "drizzle-orm";

/** Exclusive fixture range — do not reuse in other integration suites. */
const PROCESS_ID = 129_010_2;

async function cleanupProcess(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  await db.delete(criticalityMatrix).where(eq(criticalityMatrix.processId, PROCESS_ID));
  await db.delete(stakeholders).where(eq(stakeholders.processId, PROCESS_ID));
}

function insertIdOf(result: unknown): number {
  const insertId = (result as { insertId?: number | bigint } | undefined)?.insertId;
  if (typeof insertId === "bigint") return Number(insertId);
  if (typeof insertId === "number" && insertId > 0) return insertId;
  return 0;
}

describe("Criticality Matrix Router", () => {
  let db: Awaited<ReturnType<typeof getDb>>;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database connection failed");
  });

  beforeEach(async () => {
    if (!db) throw new Error("Database not available");
    await cleanupProcess(db);
  });

  afterAll(async () => {
    if (!db) return;
    await cleanupProcess(db);
  });

  it("should insert a new criticality matrix entry with action data", async () => {
    if (!db) throw new Error("Database not available");

    const stakeholderResult = await db.insert(stakeholders).values({
      processId: PROCESS_ID,
      name: "CM Insert Stakeholder",
      type: "cliente",
      isInternal: false,
      orderIndex: 0,
    });
    let stakeholderId = insertIdOf(stakeholderResult);
    if (!stakeholderId) {
      const rows = await db
        .select()
        .from(stakeholders)
        .where(eq(stakeholders.processId, PROCESS_ID));
      expect(rows).toHaveLength(1);
      stakeholderId = rows[0]!.id;
    }

    const matrixResult = await db.insert(criticalityMatrix).values({
      processId: PROCESS_ID,
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
    const matrixId = insertIdOf(matrixResult);

    const records = await db
      .select()
      .from(criticalityMatrix)
      .where(
        and(
          eq(criticalityMatrix.processId, PROCESS_ID),
          eq(criticalityMatrix.stakeholderId, stakeholderId)
        )
      );

    expect(records).toHaveLength(1);
    const record = records[0]!;
    if (matrixId) expect(record.id).toBe(matrixId);
    expect(record.actionToTake).toBe("Implementar proceso de validación");
    expect(record.startDate).toBeDefined();
    expect(record.endDate).toBeDefined();
    expect(record.criticality).toBe("4B");
  });

  it("should update an existing criticality matrix entry", async () => {
    if (!db) throw new Error("Database not available");

    const stakeholderResult = await db.insert(stakeholders).values({
      processId: PROCESS_ID,
      name: "CM Update Stakeholder",
      type: "proveedor",
      isInternal: true,
      orderIndex: 0,
    });
    let stakeholderId = insertIdOf(stakeholderResult);
    if (!stakeholderId) {
      const rows = await db
        .select()
        .from(stakeholders)
        .where(eq(stakeholders.processId, PROCESS_ID));
      stakeholderId = rows[0]!.id;
    }

    const matrixResult = await db.insert(criticalityMatrix).values({
      processId: PROCESS_ID,
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
    let recordId = insertIdOf(matrixResult);
    if (!recordId) {
      const originalRecords = await db
        .select()
        .from(criticalityMatrix)
        .where(
          and(
            eq(criticalityMatrix.processId, PROCESS_ID),
            eq(criticalityMatrix.stakeholderId, stakeholderId)
          )
        );
      expect(originalRecords).toHaveLength(1);
      recordId = originalRecords[0]!.id;
    }

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

    const updatedRecords = await db
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.id, recordId));

    expect(updatedRecords).toHaveLength(1);
    const updated = updatedRecords[0]!;
    expect(updated.actionToTake).toBe("Updated action");
    expect(updated.startDate).toBeDefined();
    expect(updated.endDate).toBeDefined();
    expect(updated.implementationStatus).toBe(true);
    expect(updated.completionPercentage).toBe(50);
  });

  it("should retrieve criticality matrix entries for consolidated schedule", async () => {
    if (!db) throw new Error("Database not available");

    const stakeholderResult = await db.insert(stakeholders).values({
      processId: PROCESS_ID,
      name: "CM Consolidate Stakeholder",
      type: "cliente",
      isInternal: false,
      orderIndex: 0,
    });
    let stakeholderId = insertIdOf(stakeholderResult);
    if (!stakeholderId) {
      const rows = await db
        .select()
        .from(stakeholders)
        .where(eq(stakeholders.processId, PROCESS_ID));
      stakeholderId = rows[0]!.id;
    }

    await db.insert(criticalityMatrix).values({
      processId: PROCESS_ID,
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

    const records = await db
      .select()
      .from(criticalityMatrix)
      .where(
        and(
          eq(criticalityMatrix.processId, PROCESS_ID),
          eq(criticalityMatrix.stakeholderId, stakeholderId)
        )
      );

    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.actionToTake).toBe("Acción 1");
    expect(record.startDate).toBeDefined();
    expect(record.endDate).toBeDefined();
    expect(record.criticality).toBe("9A");
  });

  it("should handle NULL values for optional action fields", async () => {
    if (!db) throw new Error("Database not available");

    const stakeholderResult = await db.insert(stakeholders).values({
      processId: PROCESS_ID,
      name: "CM Null Fields Stakeholder",
      type: "cliente",
      isInternal: false,
      orderIndex: 0,
    });
    let stakeholderId = insertIdOf(stakeholderResult);
    if (!stakeholderId) {
      const rows = await db
        .select()
        .from(stakeholders)
        .where(eq(stakeholders.processId, PROCESS_ID));
      stakeholderId = rows[0]!.id;
    }

    await db.insert(criticalityMatrix).values({
      processId: PROCESS_ID,
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

    const records = await db
      .select()
      .from(criticalityMatrix)
      .where(
        and(
          eq(criticalityMatrix.processId, PROCESS_ID),
          eq(criticalityMatrix.stakeholderId, stakeholderId)
        )
      );

    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.actionToTake).toBeNull();
    expect(record.startDate).toBeNull();
    expect(record.endDate).toBeNull();
  });
});
