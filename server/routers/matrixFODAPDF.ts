import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { processFODA } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

interface MatrizFODARow {
  id?: number;
  elemento: string;
  foda: 'Fortaleza' | 'Oportunidad' | 'Debilidad' | 'Amenaza';
  factor: string;
  consecuencia?: string;
  sistemaGestion: string;
  probabilidad?: string;
  impacto?: number;
  nivelRiesgo?: string;
  accionATomar?: string;
  accionDeAprovechamiento?: string;
  planContingencia?: string;
  planContinuidad?: string;
  simulacro?: string;
  fechaPlanificacionMejora?: string;
  fechaFinalPrevista?: string;
  comunicado?: string;
  partesInteresadas?: string;
  evidencia?: string;
  mejoraImplementada?: string;
  observacion?: string;
  medioVerificacion?: string;
  fechaImplementacion?: string;
  objetivoLogrado?: string;
}

export const matrixFODAPDFRouter = router({
  generatePDF: companyProcedure
    .input(z.object({ processId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const fodaRecord = await db
        .select()
        .from(processFODA)
        .where(eq(processFODA.processId, input.processId))
        .limit(1);

      if (!fodaRecord || fodaRecord.length === 0) {
        throw new Error("No FODA data found for this process");
      }

      const matrixData = fodaRecord[0].matrixData;
      if (!matrixData) {
        throw new Error("No matrix data available");
      }

      let matrixRows: MatrizFODARow[] = [];
      try {
        matrixRows = typeof matrixData === 'string' 
          ? JSON.parse(matrixData) 
          : matrixData;
      } catch (error) {
        throw new Error("Invalid matrix data format");
      }

      // Return the matrix data for PDF generation on client side
      return {
        success: true,
        matrixRows,
        processId: input.processId,
      };
    }),

  // Get matrix data for export
  getMatrixData: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const fodaRecord = await db
        .select()
        .from(processFODA)
        .where(eq(processFODA.processId, input.processId))
        .limit(1);

      if (!fodaRecord || fodaRecord.length === 0) {
        return null;
      }

      const matrixData = fodaRecord[0].matrixData;
      if (!matrixData) {
        return null;
      }

      let matrixRows: MatrizFODARow[] = [];
      try {
        matrixRows = typeof matrixData === 'string' 
          ? JSON.parse(matrixData) 
          : matrixData;
      } catch (error) {
        console.error("Error parsing matrix data:", error);
        return null;
      }

      return {
        matrixRows,
        processId: input.processId,
      };
    }),
});
