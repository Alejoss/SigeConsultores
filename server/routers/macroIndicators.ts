import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  processes,
  processTacticalObjectives,
  criticalityMatrix,
  processFODA,
  processCompliances,
  stakeholderSurveys,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Helper: calcula % meta alcanzada de un OTE según su tipo de seguimiento ──
// Replica exactamente la lógica de calcOTMetrics del frontend (TacticalPlanning.tsx)
function calcOTEPorcentaje(planData: any): number {
  const pp = parseFloat(planData.puntoPartida) || 0;
  const meta = parseFloat(planData.metaLlegada) || 0;
  const avanceMeta = parseFloat(planData.avanceMeta) || 0;
  const trackingType = planData.trackingType || 'puntual';

  if (trackingType === 'mensual_checklist') {
    const vals: boolean[] = Array.isArray(planData.checklistValues)
      ? planData.checklistValues
      : Array(12).fill(false);
    const cumplidos = vals.filter(Boolean).length;
    return Math.round((cumplidos / 12) * 100);
  }

  if (trackingType === 'mensual_sumatoria') {
    const vals: number[] = Array.isArray(planData.monthlyValues) ? planData.monthlyValues : Array(12).fill(0);
    const suma = vals.reduce((s: number, v: number) => s + (v || 0), 0);
    if (meta === pp) return 0;
    return Math.max(-100, Math.min(100, ((suma - pp) / (meta - pp)) * 100));
  }

  if (trackingType === 'mensual_promedio') {
    const vals: number[] = Array.isArray(planData.monthlyValues) ? planData.monthlyValues : Array(12).fill(0);
    const nonZero = vals.filter((v: number) => v !== 0);
    const promedio = nonZero.length > 0 ? nonZero.reduce((s: number, v: number) => s + v, 0) / nonZero.length : 0;
    if (meta === pp) return 0;
    return Math.max(-100, Math.min(100, ((promedio - pp) / (meta - pp)) * 100));
  }

  // puntual (y cualquier otro tipo)
  if (meta === pp) return 0;
  return Math.max(-100, Math.min(100, ((avanceMeta - pp) / (meta - pp)) * 100));
}

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
        // 1. Criticidad de Partes Interesadas (cálculo mixto: acciones + encuestas)
        const criticalityData = await db
          .select()
          .from(criticalityMatrix)
          .where(eq(criticalityMatrix.processId, process.id));

        // % acciones realizadas
        let accionesPercent = 0;
        if (criticalityData.length > 0) {
          const implemented = criticalityData.filter((c: any) => c.implementationStatus === true).length;
          accionesPercent = Math.round((implemented / criticalityData.length) * 100);
        }

        // % satisfacción de encuestas (NPS normalizado 0-100, CSAT 0-100, avgRating sobre 5 o 10)
        const surveysData = await db
          .select()
          .from(stakeholderSurveys)
          .where(eq(stakeholderSurveys.processId, process.id));

        let criticalidadCumplimiento = accionesPercent; // fallback: solo acciones
        if (surveysData.length > 0) {
          const surveyScores: number[] = [];
          for (const s of surveysData) {
            // NPS: escala -100 a 100 -> normalizar a 0-100
            if (s.nps !== null && s.nps !== undefined) {
              surveyScores.push(Math.round((s.nps + 100) / 2));
            }
            // CSAT: ya está en 0-100
            if (s.csat !== null && s.csat !== undefined) {
              surveyScores.push(s.csat);
            }
            // avgRating: parsear "4.2/5" o "8.4/10"
            if (s.avgRating) {
              const match = s.avgRating.match(/([\d.]+)\s*\/\s*([\d.]+)/);
              if (match) {
                const val = parseFloat(match[1]);
                const max = parseFloat(match[2]);
                if (max > 0) surveyScores.push(Math.round((val / max) * 100));
              }
            }
          }
          if (surveyScores.length > 0) {
            const avgSurvey = Math.round(surveyScores.reduce((a, b) => a + b, 0) / surveyScores.length);
            // Cálculo mixto: 50% acciones + 50% encuestas
            criticalidadCumplimiento = Math.round((accionesPercent + avgSurvey) / 2);
          }
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
                    const porcentajeMetaAlcanzado = calcOTEPorcentaje(planData);
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

            // Calculate compliance percentage as simple average of 4 indicators
            const compliancePercentage = Math.round(
              (criticalidadCumplimiento + matrizAlcanzado + objetivosTacticosAlcanzado + cumplimientosPromedio) / 4
            );

            // Calculate tactical objectives performance (same as objectives percentage)
            const objectivesPerformance = objetivosTacticosAlcanzado;

            return {
              processId: process.id,
              processName: process.name,
              compliancePercentage,
              objectivesPerformance,
              stakeholderPercentage: criticalidadCumplimiento,
              trainingsPercentage: 0,
              compliancesPercentage: cumplimientosPromedio,
              fodaPercentage: matrizAlcanzado,
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

        // 1. Criticidad de Partes Interesadas (cálculo mixto: acciones + encuestas)
        const criticalityData = await db
          .select()
          .from(criticalityMatrix)
          .where(eq(criticalityMatrix.processId, input.processId));

        // % acciones realizadas
        let accionesPercent = 0;
        if (criticalityData.length > 0) {
          const implemented = criticalityData.filter((c: any) => c.implementationStatus === true).length;
          accionesPercent = Math.round((implemented / criticalityData.length) * 100);
        }

        // % satisfacción de encuestas
        const surveysData = await db
          .select()
          .from(stakeholderSurveys)
          .where(eq(stakeholderSurveys.processId, input.processId));

        let criticalidadCumplimiento = accionesPercent; // fallback: solo acciones
        if (surveysData.length > 0) {
          const surveyScores: number[] = [];
          for (const s of surveysData) {
            if (s.nps !== null && s.nps !== undefined) {
              surveyScores.push(Math.round((s.nps + 100) / 2));
            }
            if (s.csat !== null && s.csat !== undefined) {
              surveyScores.push(s.csat);
            }
            if (s.avgRating) {
              const match = s.avgRating.match(/([\d.]+)\s*\/\s*([\d.]+)/);
              if (match) {
                const val = parseFloat(match[1]);
                const max = parseFloat(match[2]);
                if (max > 0) surveyScores.push(Math.round((val / max) * 100));
              }
            }
          }
          if (surveyScores.length > 0) {
            const avgSurvey = Math.round(surveyScores.reduce((a, b) => a + b, 0) / surveyScores.length);
            criticalidadCumplimiento = Math.round((accionesPercent + avgSurvey) / 2);
          }
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
              const porcentajeMetaAlcanzado = calcOTEPorcentaje(planData);
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
              name: "OTE",
              value: objectivesPercentage,
              total: tacticalObjectives.length,
              completed: objectivesPercentage,
              unit: "%",
            },
            compliances: {
              name: "Cumplimientos",
              value: compliancesPercentage,
              total: compliances.length,
              completed: completedCompliances,
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
