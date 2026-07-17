import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../db";
import { stakeholderCriticalities } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

describe("Stakeholder Criticality Persistence", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  const processId = 129_010_3;
  const testStakeholderName = "Test Criticality Stakeholder";

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database connection failed");

    await db
      .delete(stakeholderCriticalities)
      .where(
        and(
          eq(stakeholderCriticalities.processId, processId),
          eq(stakeholderCriticalities.name, testStakeholderName)
        )
      );
  });

  afterAll(async () => {
    if (!db) return;
    await db
      .delete(stakeholderCriticalities)
      .where(
        and(
          eq(stakeholderCriticalities.processId, processId),
          eq(stakeholderCriticalities.name, testStakeholderName)
        )
      );
  });

  it("should insert a new stakeholder criticality with action data", async () => {
    if (!db) throw new Error("Database not available");

    await db.insert(stakeholderCriticalities).values({
      processId,
      name: testStakeholderName,
      type: "Externo",
      influence: 3,
      dependence: 2,
      criticality: 3,
      accionATomar: "Implementar proceso de validación",
      fechaInicio: new Date("2026-03-13"),
      fechaFin: new Date("2026-04-14"),
      realizado: "NO",
    });

    const records = await db
      .select()
      .from(stakeholderCriticalities)
      .where(
        and(
          eq(stakeholderCriticalities.processId, processId),
          eq(stakeholderCriticalities.name, testStakeholderName)
        )
      );

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.accionATomar).toBe("Implementar proceso de validación");
    expect(record.fechaInicio).toEqual(new Date("2026-03-13"));
    expect(record.fechaFin).toEqual(new Date("2026-04-14"));
    expect(record.realizado).toBe("NO");
  });

  it("should update an existing stakeholder criticality with new action data", async () => {
    if (!db) throw new Error("Database not available");

    const updateName = "Test Update Stakeholder";

    await db.insert(stakeholderCriticalities).values({
      processId,
      name: updateName,
      type: "Interno",
      accionATomar: "Original action",
      fechaInicio: new Date("2026-03-01"),
      fechaFin: new Date("2026-03-31"),
      realizado: "NO",
    });

    const originalRecords = await db
      .select()
      .from(stakeholderCriticalities)
      .where(
        and(
          eq(stakeholderCriticalities.processId, processId),
          eq(stakeholderCriticalities.name, updateName)
        )
      );

    expect(originalRecords).toHaveLength(1);
    const recordId = originalRecords[0].id;

    await db
      .update(stakeholderCriticalities)
      .set({
        accionATomar: "Updated action",
        fechaInicio: new Date("2026-03-15"),
        fechaFin: new Date("2026-04-15"),
        realizado: "SI",
      })
      .where(eq(stakeholderCriticalities.id, recordId));

    const updatedRecords = await db
      .select()
      .from(stakeholderCriticalities)
      .where(eq(stakeholderCriticalities.id, recordId));

    expect(updatedRecords).toHaveLength(1);
    const updated = updatedRecords[0];
    expect(updated.accionATomar).toBe("Updated action");
    expect(updated.fechaInicio).toEqual(new Date("2026-03-15"));
    expect(updated.fechaFin).toEqual(new Date("2026-04-15"));
    expect(updated.realizado).toBe("SI");

    await db.delete(stakeholderCriticalities).where(eq(stakeholderCriticalities.id, recordId));
  });

  it("should handle NULL values for optional action fields", async () => {
    if (!db) throw new Error("Database not available");

    const nullTestName = "Test Null Fields Stakeholder";

    await db.insert(stakeholderCriticalities).values({
      processId,
      name: nullTestName,
      type: "Externo",
      accionATomar: null,
      fechaInicio: null,
      fechaFin: null,
      realizado: "NO",
    });

    const records = await db
      .select()
      .from(stakeholderCriticalities)
      .where(
        and(
          eq(stakeholderCriticalities.processId, processId),
          eq(stakeholderCriticalities.name, nullTestName)
        )
      );

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.accionATomar).toBeNull();
    expect(record.fechaInicio).toBeNull();
    expect(record.fechaFin).toBeNull();

    await db.delete(stakeholderCriticalities).where(eq(stakeholderCriticalities.id, record.id));
  });

  it("should retrieve stakeholder criticalities for consolidated schedule", async () => {
    if (!db) throw new Error("Database not available");

    const consolidateTestName = "Test Consolidate Stakeholder";

    await db.insert(stakeholderCriticalities).values({
      processId,
      name: consolidateTestName,
      type: "Cliente",
      accionATomar: "Acción 1",
      fechaInicio: new Date("2026-03-13"),
      fechaFin: new Date("2026-04-14"),
      realizado: "NO",
    });

    const records = await db
      .select()
      .from(stakeholderCriticalities)
      .where(
        and(
          eq(stakeholderCriticalities.processId, processId),
          eq(stakeholderCriticalities.name, consolidateTestName)
        )
      );

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.accionATomar).toBe("Acción 1");
    expect(record.fechaInicio).toEqual(new Date("2026-03-13"));
    expect(record.fechaFin).toEqual(new Date("2026-04-14"));
    expect(record.realizado).toBe("NO");

    await db.delete(stakeholderCriticalities).where(eq(stakeholderCriticalities.id, record.id));
  });
});
