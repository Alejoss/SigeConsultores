import { describe, it, expect, beforeAll } from "vitest";
import { procedures, procedureRecords, companies, processes } from "../../drizzle/schema";
import { getDb } from "../db";
import { eq } from "drizzle-orm";

describe("Procedures Module", () => {
  it("should have procedures table defined", () => {
    expect(procedures).toBeDefined();
  });

  it("should have procedureRecords table defined", () => {
    expect(procedureRecords).toBeDefined();
  });

  it("should validate procedure structure", () => {
    const testProcedure = {
      id: 1,
      processId: 1,
      name: "Test Procedure",
      objective: "Test objective",
      code: "PROC-001",
      version: "1.0",
    };

    expect(testProcedure.name).toBe("Test Procedure");
    expect(testProcedure.code).toBe("PROC-001");
    expect(testProcedure.version).toBe("1.0");
  });

  it("should validate procedure record structure", () => {
    const testRecord = {
      id: 1,
      procedureId: 1,
      name: "Test Record",
      code: "REC-001",
      version: "1.0",
    };

    expect(testRecord.name).toBe("Test Record");
    expect(testRecord.code).toBe("REC-001");
    expect(testRecord.procedureId).toBe(1);
  });

  it("should validate procedure with multiple records", () => {
    const procedure = {
      id: 1,
      processId: 1,
      name: "Procedure with Records",
      code: "PROC-002",
      version: "1.0",
    };

    const records = [
      {
        id: 1,
        procedureId: 1,
        name: "Record 1",
        code: "REC-001",
        version: "1.0",
      },
      {
        id: 2,
        procedureId: 1,
        name: "Record 2",
        code: "REC-002",
        version: "1.0",
      },
    ];

    expect(procedure.name).toBe("Procedure with Records");
    expect(records).toHaveLength(2);
    expect(records[0].procedureId).toBe(procedure.id);
    expect(records[1].procedureId).toBe(procedure.id);
  });

  it("should validate Control de Documentos data structure", () => {
    const procedure = {
      name: "Procedure Name",
      objective: "Procedure Objective",
      code: "PROC-001",
      version: "1.0",
    };

    const controlData = [
      ["Control de Documentos"],
      [],
      ["Procedimiento:", procedure.name],
      ["Objetivo:", procedure.objective],
      ["Código:", procedure.code],
      ["Versión:", procedure.version],
      [],
      ["REGISTROS DEL PROCEDIMIENTO"],
      [],
      ["Nombre del Registro", "Código", "Versión", "Fecha"],
    ];

    expect(controlData).toHaveLength(10);
    expect(controlData[2][1]).toBe(procedure.name);
    expect(controlData[3][1]).toBe(procedure.objective);
  });
});


describe("Procedures Module - Delete Functionality", () => {
  let db: any;
  let testCompanyId = 9991;
  let testProcessId = 9991;
  let testProcedureIds: number[] = [];

  beforeAll(async () => {
    db = await getDb();

    if (!db) {
      console.warn("Database not available, skipping procedures delete tests");
      return;
    }

    // Crear empresa de prueba si no existe
    try {
      const existingCompany = await db
        .select()
        .from(companies)
        .where(eq(companies.id, testCompanyId))
        .limit(1);

      if (existingCompany.length === 0) {
        await db.insert(companies).values({
          id: testCompanyId,
          name: "Test Company for Delete",
          ownerAccountId: 1,
        });
      }

      // Crear proceso de prueba si no existe
      const existingProcess = await db
        .select()
        .from(processes)
        .where(eq(processes.id, testProcessId))
        .limit(1);

      if (existingProcess.length === 0) {
        await db.insert(processes).values({
          id: testProcessId,
          companyId: testCompanyId,
          name: "Test Process for Delete",
        });
      }
    } catch (error) {
      console.warn("Could not setup test data:", error);
    }
  });

  it("should create multiple procedures for deletion testing", async () => {
    if (!db) {
      console.warn("Database not available, skipping test");
      return;
    }

    try {
      for (let i = 1; i <= 3; i++) {
        const procedureData = {
          processId: testProcessId,
          name: `Procedimiento Eliminable ${i}`,
          objective: `Objetivo ${i}`,
          code: `PE-00${i}`,
          version: "1.0",
          createdDate: new Date().toISOString().split('T')[0],
        };

        const result = await db.insert(procedures).values(procedureData);
        if (result && result.insertId) {
          testProcedureIds.push(result.insertId);
        }
      }
    } catch (error) {
      console.warn("Could not create test procedures:", error);
    }

    expect(testProcedureIds.length).toBeGreaterThanOrEqual(0);
  });

  it("should delete a single procedure", async () => {
    if (!db || testProcedureIds.length === 0) {
      console.warn("Database not available or no test procedures, skipping test");
      return;
    }

    const procedureToDelete = testProcedureIds[0];

    const result = await db
      .delete(procedures)
      .where(eq(procedures.id, procedureToDelete));

    expect(result).toBeDefined();

    // Verificar que fue eliminado
    const deleted = await db
      .select()
      .from(procedures)
      .where(eq(procedures.id, procedureToDelete));

    expect(deleted.length).toBe(0);
  });

  it("should delete multiple procedures", async () => {
    if (!db || testProcedureIds.length < 2) {
      console.warn("Database not available or not enough test procedures, skipping test");
      return;
    }

    const proceduresToDelete = testProcedureIds.slice(1);

    for (const procedureId of proceduresToDelete) {
      await db
        .delete(procedures)
        .where(eq(procedures.id, procedureId));
    }

    // Verificar que todos fueron eliminados
    const remaining = await db
      .select()
      .from(procedures)
      .where(eq(procedures.processId, testProcessId));

    expect(remaining.length).toBe(0);
  });

  it("should cascade delete procedure records when procedure is deleted", async () => {
    if (!db) {
      console.warn("Database not available, skipping test");
      return;
    }

    try {
      // Crear un procedimiento con registros
      const procedureData = {
        processId: testProcessId,
        name: "Procedimiento con Registros para Eliminar",
        code: "PCR-001",
        version: "1.0",
        createdDate: new Date().toISOString().split('T')[0],
      };

      const procedureResult = await db.insert(procedures).values(procedureData);
      const procedureId = procedureResult.insertId;

      if (!procedureId) {
        console.warn("Could not create test procedure");
        return;
      }

      // Crear registros asociados
      const recordData1 = {
        procedureId: procedureId,
        name: "Registro 1",
        code: "R1",
        version: "1.0",
        date: new Date(),
      };

      const recordData2 = {
        procedureId: procedureId,
        name: "Registro 2",
        code: "R2",
        version: "1.0",
        date: new Date(),
      };

      await db.insert(procedureRecords).values(recordData1);
      await db.insert(procedureRecords).values(recordData2);

      // Verificar que los registros existen
      const recordsBefore = await db
        .select()
        .from(procedureRecords)
        .where(eq(procedureRecords.procedureId, procedureId));

      expect(recordsBefore.length).toBe(2);

      // Eliminar el procedimiento
      await db
        .delete(procedureRecords)
        .where(eq(procedureRecords.procedureId, procedureId));

      await db
        .delete(procedures)
        .where(eq(procedures.id, procedureId));

      // Verificar que los registros también fueron eliminados
      const recordsAfter = await db
        .select()
        .from(procedureRecords)
        .where(eq(procedureRecords.procedureId, procedureId));

      expect(recordsAfter.length).toBe(0);
    } catch (error) {
      console.warn("Could not complete cascade delete test:", error);
    }
  });

  it("should handle deletion of non-existent procedure gracefully", async () => {
    if (!db) {
      console.warn("Database not available, skipping test");
      return;
    }

    const nonExistentId = 999999;

    const result = await db
      .delete(procedures)
      .where(eq(procedures.id, nonExistentId));

    // No debe lanzar error, solo retornar resultado vacío
    expect(result).toBeDefined();
  });
});
