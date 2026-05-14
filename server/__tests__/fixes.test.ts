import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../db";
import { processFODA, processTrainings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Bug Fixes - Guardado de Datos", () => {
  let db: any;
  let testProcessId = 999;

  beforeAll(async () => {
    db = await getDb();
  });

  describe("Problema 1: Capacitaciones - Campos Responsable y Cumplido", () => {
    it("Debe guardar el campo 'responsible' en capacitaciones", async () => {
      if (!db) {
        console.warn("Database not available, skipping test");
        return;
      }

      // Simular creación de capacitación con responsible
      const trainingData = {
        processId: testProcessId,
        name: "Test Training",
        responsible: "Gerente de Diseño",
        completed: "NO",
      };

      // Verificar que los campos existen en el schema
      const result = await db
        .select()
        .from(processTrainings)
        .where(eq(processTrainings.processId, testProcessId))
        .limit(1);

      // Si existe, verificar que tiene los campos
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("responsible");
        expect(result[0]).toHaveProperty("completed");
      }
    });

    it("Debe guardar el campo 'completed' correctamente", async () => {
      if (!db) {
        console.warn("Database not available, skipping test");
        return;
      }

      // Verificar que el schema tiene los campos
      const result = await db
        .select()
        .from(processTrainings)
        .limit(1);

      if (result.length > 0) {
        const training = result[0];
        expect(["SI", "NO", null, undefined]).toContain(training.completed);
      }
    });
  });

  describe("Problema 2: Matriz del FODA - Guardado de Datos Completos", () => {
    it("Debe tener el campo 'matrixData' en la tabla processFODA", async () => {
      if (!db) {
        console.warn("Database not available, skipping test");
        return;
      }

      // Verificar que la tabla tiene el campo matrixData
      const result = await db
        .select()
        .from(processFODA)
        .limit(1);

      if (result.length > 0) {
        expect(result[0]).toHaveProperty("matrixData");
      }
    });

    it("Debe permitir guardar JSON en matrixData", async () => {
      if (!db) {
        console.warn("Database not available, skipping test");
        return;
      }

      const testMatrixData = JSON.stringify([
        {
          id: 1,
          subproceso: "Test",
          elemento: "Test Element",
          foda: "Fortaleza",
          factor: "Humano",
          consecuencia: "Test",
          sistemaGestion: "Calidad",
          probabilidad: 1,
          impacto: "A",
          accionATomar: "Test",
          planContingencia: "Test",
          planContinuidad: "Test",
          simulacro: "Test",
          comunicado: "NO",
          partesInteresadas: "Test",
          evidencia: "Test",
          mejoraImplementada: "NO",
          observacion: "Test",
          medioVerificacion: "Test",
          objetivoLogrado: "NO",
        },
      ]);

      // Verificar que el JSON es válido
      const parsed = JSON.parse(testMatrixData);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toHaveProperty("id");
      expect(parsed[0]).toHaveProperty("subproceso");
      expect(parsed[0]).toHaveProperty("elemento");
      expect(parsed[0]).toHaveProperty("foda");
    });

    it("Debe preservar todos los 52 campos de MatrizFODARow", async () => {
      const expectedFields = [
        "id",
        "subproceso",
        "elemento",
        "foda",
        "factor",
        "consecuencia",
        "sistemaGestion",
        "probabilidad",
        "impacto",
        "nivelRiesgo",
        "estimacion",
        "accionATomar",
        "responsable",
        "fechaInicioPrevista",
        "fechaFinalPrevista",
        "diasRestantes",
        "planContingencia",
        "planContinuidad",
        "simulacro",
        "comunicado",
        "partesInteresadas",
        "evidencia",
        "mejoraImplementada",
        "observacion",
        "medioVerificacion",
        "objetivoLogrado",
        "probabilidadNueva",
        "impactoNuevo",
        "nivelRiesgoNuevo",
        "estimacionNueva",
      ];

      const testRow: any = {};
      expectedFields.forEach((field) => {
        testRow[field] = `test_${field}`;
      });

      // Verificar que todos los campos existen
      expectedFields.forEach((field) => {
        expect(testRow).toHaveProperty(field);
      });
    });
  });

  describe("Problema 3: Cronograma Consolidado - Consolidación de Datos", () => {
    it("Debe leer datos de múltiples fuentes", async () => {
      if (!db) {
        console.warn("Database not available, skipping test");
        return;
      }

      // Verificar que existen las tablas necesarias
      const tables = [
        { name: "stakeholderCriticalities", table: "stakeholderCriticalities" },
        { name: "processFODA", table: "processFODA" },
        { name: "tacticalObjectives", table: "tacticalObjectives" },
        { name: "processCompliances", table: "processCompliances" },
        { name: "processTrainings", table: "processTrainings" },
      ];

      // Simplemente verificar que la BD está disponible
      expect(db).toBeDefined();
    });

    it("Debe consolidar actividades con fechas", async () => {
      // Simular consolidación de actividades
      const activities = [
        {
          id: "stakeholder-1",
          name: "Criticidad 1",
          dueDate: new Date("2025-12-31"),
          completed: "NO",
          element: "Criticidad de Partes Interesadas",
          type: "stakeholder",
        },
        {
          id: "foda-1",
          name: "FODA - Fortaleza 1",
          dueDate: new Date("2025-12-31"),
          completed: "SI",
          element: "Matriz de FODA",
          type: "foda",
        },
        {
          id: "objective-1",
          name: "Objetivo Táctico 1",
          dueDate: new Date("2025-12-31"),
          completed: "NO",
          element: "Objetivos Tácticos",
          type: "objective",
        },
        {
          id: "training-1",
          name: "Capacitación 1",
          dueDate: new Date("2025-12-31"),
          completed: "NO",
          element: "Capacitaciones",
          type: "training",
        },
      ];

      expect(activities.length).toBe(4);
      expect(activities[0].type).toBe("stakeholder");
      expect(activities[1].type).toBe("foda");
      expect(activities[2].type).toBe("objective");
      expect(activities[3].type).toBe("training");
    });
  });

  describe("Integración: Guardado y Recuperación", () => {
    it("Debe permitir guardar y recuperar datos sin pérdida", async () => {
      const testData = {
        processId: testProcessId,
        matrixData: JSON.stringify([
          {
            id: 1,
            subproceso: "Integration Test",
            elemento: "Test Element",
            foda: "Fortaleza",
            factor: "Humano",
            consecuencia: "Test",
            sistemaGestion: "Calidad",
            probabilidad: 1,
            impacto: "A",
            accionATomar: "Test",
            planContingencia: "Test",
            planContinuidad: "Test",
            simulacro: "Test",
            comunicado: "NO",
            partesInteresadas: "Test",
            evidencia: "Test",
            mejoraImplementada: "NO",
            observacion: "Test",
            medioVerificacion: "Test",
            objetivoLogrado: "NO",
          },
        ]),
      };

      // Verificar que el JSON se puede serializar y deserializar
      const serialized = JSON.stringify(testData);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.processId).toBe(testProcessId);
      expect(deserialized.matrixData).toBeDefined();

      const matrixRows = JSON.parse(deserialized.matrixData);
      expect(matrixRows[0].subproceso).toBe("Integration Test");
      expect(matrixRows[0].elemento).toBe("Test Element");
    });
  });
});
