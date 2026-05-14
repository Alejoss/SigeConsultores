import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { processFODA, processCompliances, processTrainings, criticalityMatrix, processTacticalObjectives } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const consolidatedIndicatorsRouter = router({
  getConsolidatedIndicators: protectedProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      try {
        // Get Criticidad Partes Interesadas - Porcentaje de cumplimiento
        // Calculate as: (number of completed entries) / (total entries) * 100
        // Use only the latest entry for each stakeholder to avoid duplicates
        const criticalityEntries = await db.select().from(criticalityMatrix)
          .where(eq(criticalityMatrix.processId, input.processId));
        
        let criticalidadCumplimiento = 0;
        if (criticalityEntries.length > 0) {
          // Group by stakeholderId and keep only the latest entry
          const latestByStakeholder = new Map();
          criticalityEntries.forEach((entry: any) => {
            const existing = latestByStakeholder.get(entry.stakeholderId);
            if (!existing || new Date(entry.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
              latestByStakeholder.set(entry.stakeholderId, entry);
            }
          });
          
          const uniqueEntries = Array.from(latestByStakeholder.values());
          const completed = uniqueEntries.filter((entry: any) => entry.implementationStatus === true).length;
          criticalidadCumplimiento = Math.round((completed / uniqueEntries.length) * 100);
        }

        // Get Matriz del FODA - Total alcanzado y % Comunicado
        // Use the most recent record if multiple exist
        const fodaData = await db.select().from(processFODA)
          .where(eq(processFODA.processId, input.processId));
        
        let matrizAlcanzado = 0;
        let matrizComunicado = 0;
        
        if (fodaData.length > 0) {
          // Get the most recent record
          const latestFoda = fodaData.reduce((latest: any, current: any) => {
            if (!latest) return current;
            const latestTime = new Date(latest.createdAt || 0).getTime();
            const currentTime = new Date(current.createdAt || 0).getTime();
            return currentTime > latestTime ? current : latest;
          });
          
          if (latestFoda && latestFoda.matrixData) {
            try {
              const matrixRows = JSON.parse(latestFoda.matrixData);
              if (Array.isArray(matrixRows)) {
                // Count rows where objetivoLogrado = "SI" and comunicado = "SI"
                const implemented = matrixRows.filter((row: any) => row.objetivoLogrado === "SI").length;
                const communicated = matrixRows.filter((row: any) => row.comunicado === "SI").length;
                
                // Return the count of implemented items (not percentage) to match ProcessRiskMatrix display
                // ProcessRiskMatrix shows totalAlcanzado as a number, not a percentage
                matrizAlcanzado = implemented;
                matrizComunicado = matrixRows.length > 0 ? Math.round((communicated / matrixRows.length) * 100) : 0;
              }
            } catch (e) {
              console.error("Error parsing FODA matrix data:", e);
            }
          }
        }

           // Get Objetivos Tácticos - % Meta Alcanzada
        const tacticalObjectives = await db.select().from(processTacticalObjectives)
          .where(eq(processTacticalObjectives.processId, input.processId));
        
        let objetivosTacticosMetaAlcanzada = 0;
        if (tacticalObjectives.length > 0) {
          let totalMetaAlcanzada = 0;
          let objectiveCount = 0;

          tacticalObjectives.forEach((obj: any) => {
            if (obj.planningData) {
              try {
                const planningData = JSON.parse(obj.planningData);
                // Extract metaAlcanzada from planningData (this is the % Meta Alcanzada value)
                const metaAlcanzada = planningData.metaAlcanzada || 0;
                totalMetaAlcanzada += metaAlcanzada;
                objectiveCount += 1;
              } catch (e) {
                console.error("Error parsing planning data:", e);
              }
            }
          });
          
          objetivosTacticosMetaAlcanzada = objectiveCount > 0 ? Math.round(totalMetaAlcanzada / objectiveCount) : 0;
        }

        // Get Cumplimientos - % Promedio de cumplimiento
        const compliances = await db.select().from(processCompliances)
          .where(eq(processCompliances.processId, input.processId));
        
        let cumplimientosPromedio = 0;
        if (compliances.length > 0) {
          const completed = compliances.filter(c => c.completed === "SI").length;
          cumplimientosPromedio = Math.round((completed / compliances.length) * 100);
        }

        // Get Capacitaciones - % Impartidas
        const trainings = await db.select().from(processTrainings)
          .where(eq(processTrainings.processId, input.processId));
        
        let capacitacionesImpartidas = 0;
        if (trainings.length > 0) {
          const conducted = trainings.filter(t => t.conductedDate !== null).length;
          capacitacionesImpartidas = Math.round((conducted / trainings.length) * 100);
        }

        return [
          {
            id: "cumplimiento",
            name: "Criticidad Partes Interesadas",
            indicator: "Porcentaje de cumplimiento",
            value: criticalidadCumplimiento,
            performance: criticalidadCumplimiento
          },
          {
            id: "total_alcanzado",
            name: "Matriz (FODA)",
            indicator: "Total alcanzado",
            value: matrizAlcanzado,
            performance: matrizAlcanzado
          },
          {
            id: "comunicado",
            name: "Matriz (FODA)",
            indicator: "%Comunicado",
            value: matrizComunicado,
            performance: matrizComunicado
          },
          {
            id: "alcanzado",
            name: "Objetivos tácticos (Planificación)",
            indicator: "% Meta Alcanzada",
            value: objetivosTacticosMetaAlcanzada,
            performance: objetivosTacticosMetaAlcanzada
          },
          {
            id: "promedio_cumplimiento",
            name: "Cumplimientos",
            indicator: "%Promedio de cumplimiento",
            value: cumplimientosPromedio,
            performance: cumplimientosPromedio
          },
          {
            id: "impartidas",
            name: "Capacitaciones",
            indicator: "%Impartidas",
            value: capacitacionesImpartidas,
            performance: capacitacionesImpartidas
          }
        ];
      } catch (error) {
        console.error("[Consolidated Indicators] Error fetching indicators:", error);
        return [];
      }
    }),
});
