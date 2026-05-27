import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  processes,
  processScheduleActivities,
  processTacticalObjectives,
  criticalityMatrix,
  processFODA,
  processCompliances,
  processTrainings,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const macroIndicatorsRouter = router({
  getMacroIndicators: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      if (input.companyId <= 0) {
        return [];
      }

      try {
        const db = await getDb();
        if (!db) {
          console.warn("[MacroIndicators] Database not available");
          return [];
        }

        // Get all processes for the company
        const companyProcesses = await db
          .select()
          .from(processes)
          .where(eq(processes.companyId, input.companyId));

        // For each process, calculate macro indicators based on 5 detailed indicators
        const macroIndicators = await Promise.all(
          companyProcesses.map(async (process) => {
        // 1. Criticidad de Partes Interesadas
        const criticalityData = await db
          .select()
          .from(criticalityMatrix)
          .where(eq(criticalityMatrix.processId, process.id));

        let criticalidadCumplimiento = 0;
        if (criticalityData.length > 0) {
          const implemented = criticalityData.filter((c: any) => c.implementationStatus === true).length;
          criticalidadCumplimiento = Math.round((implemented / criticalityData.length) * 100);
        }

            // 2. Matriz FODA
            const fodaData = await db
              .select()
              .from(processFODA)
              .where(eq(processFODA.processId, process.id))
              .limit(1);

            let matrizAlcanzado = 0;
            if (fodaData.length > 0 && fodaData[0].matrixData) {
              try {
                const matrixRows = JSON.parse(fodaData[0].matrixData);
                if (Array.isArray(matrixRows)) {
                  const implemented = matrixRows.filter((row: any) => row.objetivoLogrado === 'SI').length;
                  matrizAlcanzado = matrixRows.length > 0 ? Math.round((implemented / matrixRows.length) * 100) : 0;
                }
              } catch (e) {
                console.error("Error parsing FODA matrix data:", e);
              }
            }

            // 3. Objetivos Tácticos
            const tacticalObjectives = await db
              .select()
              .from(processTacticalObjectives)
              .where(eq(processTacticalObjectives.processId, process.id));

            let objetivosTacticosAlcanzado = 0;
            if (tacticalObjectives.length > 0) {
              let totalPonderado = 0;
              tacticalObjectives.forEach((obj: any) => {
                if (obj.planningData) {
                  try {
                    const planData = JSON.parse(obj.planningData);
                    const ponderacion = parseFloat(planData.ponderacion) || 0;
                    const puntoPartida = parseFloat(planData.puntoPartida) || 0;
                    const metaLlegada = parseFloat(planData.metaLlegada) || 0;
                    const avanceMeta = parseFloat(planData.avanceMeta) || 0;
                    let porcentajeMetaAlcanzado = 0;
                    if (metaLlegada !== puntoPartida) {
                      porcentajeMetaAlcanzado = ((avanceMeta - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
                      porcentajeMetaAlcanzado = Math.max(-100, Math.min(100, porcentajeMetaAlcanzado));
                    }
                    totalPonderado += porcentajeMetaAlcanzado * (ponderacion / 100);
                  } catch (e) {
                    console.error("Error parsing planning data:", e);
                  }
                }
              });
              objetivosTacticosAlcanzado = Math.round(totalPonderado);
            }

            // 4. Cumplimientos
            const compliances = await db
              .select()
              .from(processCompliances)
              .where(eq(processCompliances.processId, process.id));

            let cumplimientosPromedio = 0;
            if (compliances.length > 0) {
              const completed = compliances.filter(c => c.completed === "SI").length;
              cumplimientosPromedio = Math.round((completed / compliances.length) * 100);
            }

            // 5. Capacitaciones
            const trainings = await db
              .select()
              .from(processTrainings)
              .where(eq(processTrainings.processId, process.id));

            let capacitacionesImpartidas = 0;
            if (trainings.length > 0) {
              const conducted = trainings.filter(t => t.conductedDate !== null).length;
              capacitacionesImpartidas = Math.round((conducted / trainings.length) * 100);
            }

            // Calculate compliance percentage as simple average of 5 indicators
            const compliancePercentage = Math.round(
              (criticalidadCumplimiento + matrizAlcanzado + objetivosTacticosAlcanzado + cumplimientosPromedio + capacitacionesImpartidas) / 5
            );

            // Calculate tactical objectives performance (same as objectives percentage)
            const objectivesPerformance = objetivosTacticosAlcanzado;

            return {
              processId: process.id,
              processName: process.name,
              compliancePercentage,
              objectivesPerformance,
              totalActivities: 0,
              completedActivities: 0,
              totalObjectives: tacticalObjectives.length,
            };
          })
        );

        return macroIndicators;
      } catch (error) {
        console.error("[MacroIndicators] Error fetching macro indicators:", error);
        return [];
      }
    }),

  // Get detailed indicators for a specific process (5 indicators)
  getProcessIndicators: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      if (input.processId <= 0) {
        return null;
      }

      try {
        const db = await getDb();
        if (!db) {
          console.warn("[MacroIndicators] Database not available");
          return null;
        }

        // 1. Criticidad de Partes Interesadas
        const criticalityData = await db
          .select()
          .from(criticalityMatrix)
          .where(eq(criticalityMatrix.processId, input.processId));

        let criticalidadCumplimiento = 0;
        if (criticalityData.length > 0) {
          const implemented = criticalityData.filter((c: any) => c.implementationStatus === true).length;
          criticalidadCumplimiento = Math.round((implemented / criticalityData.length) * 100);
        }

        // 2. Matriz FODA
        const fodaData = await db
          .select()
          .from(processFODA)
          .where(eq(processFODA.processId, input.processId))
          .limit(1);

        let matrizAlcanzado = 0;
        let matrizComunicado = 0;
        
        if (fodaData.length > 0 && fodaData[0].matrixData) {
          try {
            const matrixRows = JSON.parse(fodaData[0].matrixData);
            if (Array.isArray(matrixRows)) {
              const implemented = matrixRows.filter((row: any) => row.objetivoLogrado === 'SI').length;
              const communicated = matrixRows.filter((row: any) => row.comunicado === 'SI').length;
              matrizAlcanzado = matrixRows.length > 0 ? Math.round((implemented / matrixRows.length) * 100) : 0;
              matrizComunicado = matrixRows.length > 0 ? Math.round((communicated / matrixRows.length) * 100) : 0;
            }
          } catch (e) {
            console.error("Error parsing FODA matrix data:", e);
          }
        }

        // 3. Objetivos Tácticos
        const tacticalObjectives = await db
          .select()
          .from(processTacticalObjectives)
          .where(eq(processTacticalObjectives.processId, input.processId));

        let totalPonderadoOT = 0;
        tacticalObjectives.forEach((obj: any) => {
          if (obj.planningData) {
            try {
              const planData = JSON.parse(obj.planningData);
              const ponderacion = parseFloat(planData.ponderacion) || 0;
              const puntoPartida = parseFloat(planData.puntoPartida) || 0;
              const metaLlegada = parseFloat(planData.metaLlegada) || 0;
              const avanceMeta = parseFloat(planData.avanceMeta) || 0;
              let porcentajeMetaAlcanzado = 0;
              if (metaLlegada !== puntoPartida) {
                porcentajeMetaAlcanzado = ((avanceMeta - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
                porcentajeMetaAlcanzado = Math.max(-100, Math.min(100, porcentajeMetaAlcanzado));
              }
              totalPonderadoOT += porcentajeMetaAlcanzado * (ponderacion / 100);
            } catch (e) {
              console.error("Error parsing planning data:", e);
            }
          }
        });
        const objectivesPercentage =
          tacticalObjectives.length > 0
            ? Math.round(totalPonderadoOT)
            : 0;

        // 4. Cumplimientos
        const compliances = await db
          .select()
          .from(processCompliances)
          .where(eq(processCompliances.processId, input.processId));

        const completedCompliances = compliances.filter(
          (c) => c.completed === "SI"
        ).length;
        const compliancesPercentage =
          compliances.length > 0
            ? Math.round((completedCompliances / compliances.length) * 100)
            : 0;

        // 5. Capacitación
        const trainings = await db
          .select()
          .from(processTrainings)
          .where(eq(processTrainings.processId, input.processId));

        const conductedTrainings = trainings.filter(
          (t) => t.conductedDate !== null
        ).length;
        const trainingsPercentage =
          trainings.length > 0
            ? Math.round((conductedTrainings / trainings.length) * 100)
            : 0;

        return {
          processId: input.processId,
          indicators: {
            stakeholderCriticality: {
              name: "Criticidad de Partes Interesadas",
              value: criticalidadCumplimiento,
              total: criticalityData.length,
              unit: "%",
            },
            foda: {
              name: "Matriz FODA",
              value: matrizAlcanzado,
              total: fodaData.length > 0 ? 1 : 0,
              unit: "%",
            },
            tacticalObjectives: {
              name: "Objetivos Tácticos",
              value: objectivesPercentage,
              total: tacticalObjectives.length,
              completed: Math.round(totalObjectivesProgress / tacticalObjectives.length),
              unit: "%",
            },
            compliances: {
              name: "Cumplimientos",
              value: compliancesPercentage,
              total: compliances.length,
              completed: completedCompliances,
              unit: "%",
            },
            trainings: {
              name: "Capacitación",
              value: trainingsPercentage,
              total: trainings.length,
              conducted: conductedTrainings,
              unit: "%",
            },
            matrizComunicado: {
              name: "Matriz FODA - Comunicado",
              value: matrizComunicado,
              total: fodaData.length > 0 ? 1 : 0,
              unit: "%",
            },
          },
        };
      } catch (error) {
        console.error("[MacroIndicators] Error fetching process indicators:", error);
        return null;
      }
    }),
});
