import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../db";
import { stakeholderCriticalities } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";

describe("Stakeholder Criticality Persistence", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  const processId = 1290002;
  const testStakeholderName = "Test Criticality Stakeholder";

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database connection failed");

    // Clean up any existing test records
    if (db) {
      await db
        .delete(stakeholderCriticalities)
        .where(
          and(
            eq(stakeholderCriticalities.processId, processId),
            eq(stakeholderCriticalities.nombre, testStakeholderName)
          )
        );
    }
  });

  afterAll(async () => {
    // Clean up test records
    if (db) {
      await db
        .delete(stakeholderCriticalities)
        .where(
          and(
            eq(stakeholderCriticalities.processId, processId),
            eq(stakeholderCriticalities.nombre, testStakeholderName)
          )
        );
    }
  });

  it("should insert a new stakeholder criticality with action data", async () => {
    if (!db) throw new Error("Database not available");

    // Insert a new record
    await db.insert(stakeholderCriticalities).values({
      processId,
      nombre: testStakeholderName,
      internoExterno: "Externo",
      clienteProveedor: "Cliente",
      entrega: "Producto final",
      solicita: "Especificaciones",
      criticidad: "3A",
      defensasExistentes: "Control de calidad",
      accionATomar: "Implementar proceso de validación",
      observaciones: "Test observation",
      fechaInicio: new Date("2026-03-13"),
      fechaFin: new Date("2026-04-14"),
      realizado: "NO",
    });

    // Verify the record was inserted
    const records = await db
      .select()
      .from(stakeholderCriticalities)
      .where(
        and(
          eq(stakeholderCriticalities.processId, processId),
          eq(stakeholderCriticalities.nombre, testStakeholderName)
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

    // First insert
    await db.insert(stakeholderCriticalities).values({
      processId,
      nombre: updateName,
      internoExterno: "Interno",
      clienteProveedor: "Proveedor",
      entrega: "Servicio",
      solicita: "Requisitos",
      criticidad: "6A",
      defensasExistentes: "Auditoría",
      accionATomar: "Original action",
      observaciones: "Original observation",
      fechaInicio: new Date("2026-03-01"),
      fechaFin: new Date("2026-03-31"),
      realizado: "NO",
    });

    // Get the inserted record's ID
    const originalRecords = await db
      .select()
      .from(stakeholderCriticalities)
      .where(
        and(
          eq(stakeholderCriticalities.processId, processId),
          eq(stakeholderCriticalities.nombre, updateName)
        )
      );

    expect(originalRecords).toHaveLength(1);
    const recordId = originalRecords[0].id;

    // Update the record
    await db
      .update(stakeholderCriticalities)
      .set({
        accionATomar: "Updated action",
        fechaInicio: new Date("2026-03-15"),
        fechaFin: new Date("2026-04-15"),
        realizado: "SI",
      })
      .where(eq(stakeholderCriticalities.id, recordId));

    // Verify the update
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

    // Clean up
    await db
      .delete(stakeholderCriticalities)
      .where(eq(stakeholderCriticalities.id, recordId));
  });

  it("should handle NULL values for optional action fields", async () => {
    if (!db) throw new Error("Database not available");

    const nullTestName = "Test Null Fields Stakeholder";

    // Insert with NULL action fields
    await db.insert(stakeholderCriticalities).values({
      processId,
      nombre: nullTestName,
      internoExterno: "Externo",
      clienteProveedor: "Cliente",
      entrega: "Producto",
      solicita: "Especificaciones",
      criticidad: "2C",
      defensasExistentes: "Documentación",
      accionATomar: null,
      observaciones: null,
      fechaInicio: null,
      fechaFin: null,
      realizado: "NO",
    });

    // Verify NULL values are preserved
    const records = await db
      .select()
      .from(stakeholderCriticalities)
      .where(
        and(
          eq(stakeholderCriticalities.processId, processId),
          eq(stakeholderCriticalities.nombre, nullTestName)
        )
      );

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.accionATomar).toBeNull();
    expect(record.fechaInicio).toBeNull();
    expect(record.fechaFin).toBeNull();

    // Clean up
    const recordId = record.id;
    await db
      .delete(stakeholderCriticalities)
      .where(eq(stakeholderCriticalities.id, recordId));
  });

  it("should retrieve stakeholder criticalities for consolidated schedule", async () => {
    if (!db) throw new Error("Database not available");

    const consolidateTestName = "Test Consolidate Stakeholder";

    // Insert multiple records
    await db.insert(stakeholderCriticalities).values({
      processId,
      nombre: consolidateTestName,
      internoExterno: "Externo",
      clienteProveedor: "Cliente",
      entrega: "Producto",
      solicita: "Especificaciones",
      criticidad: "3A",
      defensasExistentes: "Control",
      accionATomar: "Acción 1",
      observaciones: "Obs 1",
      fechaInicio: new Date("2026-03-13"),
      fechaFin: new Date("2026-04-14"),
      realizado: "NO",
    });

    // Query for consolidation
    const records = await db
      .select()
      .from(stakeholderCriticalities)
      .where(
        and(
          eq(stakeholderCriticalities.processId, processId),
          eq(stakeholderCriticalities.nombre, consolidateTestName)
        )
      );

    expect(records).toHaveLength(1);
    const record = records[0];

    // Verify all fields needed for consolidation are present
    expect(record.accionATomar).toBe("Acción 1");
    expect(record.fechaInicio).toEqual(new Date("2026-03-13"));
    expect(record.fechaFin).toEqual(new Date("2026-04-14"));
    expect(record.realizado).toBe("NO");

    // Clean up
    const recordId = record.id;
    await db
      .delete(stakeholderCriticalities)
      .where(eq(stakeholderCriticalities.id, recordId));
  });
});
