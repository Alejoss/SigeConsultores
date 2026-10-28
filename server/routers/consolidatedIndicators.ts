import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { assertProcessAccessById } from "../_core/companyPermissions";
import { getDb } from "../db";
import { processFODA, processCompliances, criticalityMatrix, processOutputReleaseControls, processOutputReleasePeriods, processTacticalObjectives } from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import { calculateActivityProgress } from "../lib/processActivities";
import { calculateOtgProgress } from "../lib/otgProgress";
import { calculateStakeholderActionProgress } from "@shared/stakeholderActionProgress";

// ─── Helpers de cálculo (replicados del frontend) ────────────────────────────

function calcPct(ci: number, meta: number, ca: number): number {
  if (meta === ci) return 0;
  const p = ((ca - ci) / (meta - ci)) * 100;
  return Math.max(-100, Math.min(100, p));
}

function calcOOPercent(rk: any): number {
  const type = rk.ooTrackingType || 'puntual';
  const ci = parseFloat(rk.condicionInicial) || 0;
  const meta = parseFloat(rk.meta) || 0;

  if (type === 'puntual') {
    return calcPct(ci, meta, parseFloat(rk.condicionActual) || 0);
  }
  if (type === 'mensual_sumatoria') {
    const vals: number[] = Array.isArray(rk.ooMonthlyValues) ? rk.ooMonthlyValues : Array(12).fill(0);
    const suma = vals.reduce((s: number, v: number) => s + (v || 0), 0);
    return calcPct(ci, meta, suma);
  }
  if (type === 'mensual_promedio') {
    const vals: number[] = Array.isArray(rk.ooMonthlyValues) ? rk.ooMonthlyValues : Array(12).fill(0);
    const nonZero = vals.filter((v: number) => v !== 0);
    const promedio = nonZero.length > 0 ? nonZero.reduce((s: number, v: number) => s + v, 0) / nonZero.length : 0;
    return calcPct(ci, meta, promedio);
  }
  if (type === 'mensual_checklist') {
    const vals: boolean[] = Array.isArray(rk.ooChecklistValues) ? rk.ooChecklistValues : Array(12).fill(false);
    const cumplidos = vals.filter(Boolean).length;
    return Math.round((cumplidos / 12) * 100);
  }
  return parseFloat(rk.porcentajeAlcanzado) || 0;
}

function calcTasksAverage(tasks: any[]): number | null {
  if (!tasks || tasks.length === 0) return null; // null = sin tareas
  const totalWeighting = tasks.reduce((s: number, t: any) => s + (t.weighting || 0), 0);
  if (totalWeighting === 0) {
    return tasks.reduce((s: number, t: any) => s + (t.percentageCompleted || 0), 0) / tasks.length;
  }
  return tasks.reduce((s: number, t: any) => s + (t.percentageCompleted || 0) * (t.weighting || 0), 0) / totalWeighting;
}

export const consolidatedIndicatorsRouter = router({
  getConsolidatedIndicators: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertProcessAccessById(ctx, input.processId);
      const db = await getDb();
      if (!db) return [];

      try {
        // ── Partes Interesadas ────────────────────────────────────────────────
        const criticalityEntries = await db.select().from(criticalityMatrix)
          .where(eq(criticalityMatrix.processId, input.processId));

        // Una parte interesada sólo entra al indicador si se ha planificado una
        // acción. La misma fórmula es usada por la matriz de Gestión con Partes
        // Interesadas; así ambos lugares muestran exactamente el mismo avance.
        const criticalityProgress = calculateStakeholderActionProgress(criticalityEntries);
        const criticalidadCumplimiento = criticalityProgress.percentage;

        // ── OTG (Matriz FODA) ─────────────────────────────────────────────────
        const fodaData = await db.select().from(processFODA)
          .where(eq(processFODA.processId, input.processId));

        // El estado "objetivoLogrado" se conserva como conteo informativo.
        // El cumplimiento del OTG se calcula exclusivamente desde el avance de sus tareas.
        let matrizAlcanzado = 0;
        let matrizCumplimiento = 0;
        let matrizComunicado = 0;
        let otgRows: any[] = [];

        if (fodaData.length > 0) {
          const latestFoda = fodaData.reduce((latest: any, current: any) => {
            if (!latest) return current;
            return new Date(current.createdAt || 0).getTime() > new Date(latest.createdAt || 0).getTime() ? current : latest;
          });

          if (latestFoda?.matrixData) {
            try {
              const matrixRows = JSON.parse(latestFoda.matrixData);
              if (Array.isArray(matrixRows)) {
                const communicated = matrixRows.filter((row: any) => row.comunicado === "SI").length;
                matrizComunicado = matrixRows.length > 0 ? Math.round((communicated / matrixRows.length) * 100) : 0;

                // El avance OTG usa la fórmula canónica de la matriz. Esta cubre
                // acciones actuales (valor puntual, mensuales y checklist) y
                // registros históricos que guardaban el porcentaje en la fila.
                otgRows = matrixRows.map((row: any) => {
                  const acciones: any[] = Array.isArray(row.acciones) ? row.acciones : [];
                  const pctOTGRedondeado = calculateOtgProgress(row);
                  // Un OTG sólo está logrado si tiene tareas y todas alcanzan el 100 % real.
                  const objetivoLogrado = acciones.length > 0 && pctOTGRedondeado >= 100;
                  return {
                    id: row.id || String(Math.random()),
                    name: row.accionATomar || row.name || "OTG sin nombre",
                    pctOTG: pctOTGRedondeado,
                    comunicado: row.comunicado === "SI",
                    objetivoLogrado,
                    tareas: acciones.map((a: any) => ({
                      id: a.id || String(Math.random()),
                      description: a.accion || a.description || "Sin descripción",
                      ponderacion: a.ponderacion || 0,
                      porcentajeAlcanzado: Math.round(parseFloat(a.alcanzado) || 0),
                    })),
                  };
                });
                matrizCumplimiento = otgRows.length > 0
                  ? Math.round(otgRows.reduce((sum, otg) => sum + otg.pctOTG, 0) / otgRows.length)
                  : 0;
                matrizAlcanzado = otgRows.filter((otg) => otg.objetivoLogrado).length;
              }
            } catch (e) {
              console.error("Error parsing FODA matrix data:", e);
            }
          }
        }

        // ── OTE (Objetivos Tácticos Estratégicos) ────────────────────────────
        const tacticalObjectives = await db.select().from(processTacticalObjectives)
          .where(eq(processTacticalObjectives.processId, input.processId));

        let objetivosTacticosMetaAlcanzada = 0;
        let oteRows: any[] = [];

        if (tacticalObjectives.length > 0) {
          let totalPonderado = 0;

          for (const obj of tacticalObjectives) {
            if (!obj.planningData) continue;
            try {
              const pd = JSON.parse(obj.planningData as string);
              const ponderacion = parseFloat(pd.ponderacion) || 0;
              const puntoPartida = parseFloat(pd.puntoPartida) || 0;
              const metaLlegada = parseFloat(pd.metaLlegada) || 0;
              const avanceMeta = parseFloat(pd.avanceMeta) || 0;
              const trackingTypeOTE = pd.trackingType || 'puntual';

              // % Meta Alcanzada del OTE — replicar exactamente la lógica de calcOTMetrics del frontend
              let porcentajeMetaAlcanzado = 0;
              if (trackingTypeOTE === 'mensual_checklist') {
                // Para checklist: % = meses_cumplidos / 12 * 100 (independiente de puntoPartida/metaLlegada)
                const clVals: boolean[] = Array.isArray(pd.checklistValues)
                  ? pd.checklistValues
                  : Array(12).fill(false);
                const cumplidos = clVals.filter(Boolean).length;
                porcentajeMetaAlcanzado = Math.round((cumplidos / 12) * 100);
              } else if (trackingTypeOTE === 'mensual_sumatoria') {
                const mvVals: number[] = Array.isArray(pd.monthlyValues) ? pd.monthlyValues : Array(12).fill(0);
                const suma = mvVals.reduce((s: number, v: number) => s + (v || 0), 0);
                if (metaLlegada !== puntoPartida) {
                  porcentajeMetaAlcanzado = ((suma - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
                  porcentajeMetaAlcanzado = Math.max(-100, Math.min(100, porcentajeMetaAlcanzado));
                }
              } else if (trackingTypeOTE === 'mensual_promedio') {
                const mvVals: number[] = Array.isArray(pd.monthlyValues) ? pd.monthlyValues : Array(12).fill(0);
                const nonZero = mvVals.filter((v: number) => v !== 0);
                const promedio = nonZero.length > 0 ? nonZero.reduce((s: number, v: number) => s + v, 0) / nonZero.length : 0;
                if (metaLlegada !== puntoPartida) {
                  porcentajeMetaAlcanzado = ((promedio - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
                  porcentajeMetaAlcanzado = Math.max(-100, Math.min(100, porcentajeMetaAlcanzado));
                }
              } else {
                // puntual (y cualquier otro tipo)
                if (metaLlegada !== puntoPartida) {
                  porcentajeMetaAlcanzado = ((avanceMeta - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
                  porcentajeMetaAlcanzado = Math.max(-100, Math.min(100, porcentajeMetaAlcanzado));
                }
              }
              totalPonderado += porcentajeMetaAlcanzado * (ponderacion / 100);

              // Construir detalle de Objetivos Operativos y Tareas
              const resultKeys: any[] = Array.isArray(pd.resultKeys) ? pd.resultKeys : [];
              const ooList = resultKeys.map((rk: any) => {
                const tasks: any[] = Array.isArray(rk.tasks) ? rk.tasks : [];
                const pctOO = Math.round(calcOOPercent(rk));
                const tasksAvg = calcTasksAverage(tasks);

                return {
                  id: rk.id || String(Math.random()),
                  description: rk.description || "Objetivo Operativo sin descripción",
                  ponderacion: rk.ponderacion || 0,
                  condicionInicial: rk.condicionInicial || 0,
                  meta: rk.meta || 0,
                  condicionActual: rk.condicionActual || 0,
                  porcentajeAlcanzado: pctOO,
                  responsible: rk.responsible || "",
                  endDate: rk.endDate || "",
                  hasTasks: tasks.length > 0,
                  tasksAverage: tasksAvg,
                  tasks: tasks.map((t: any) => ({
                    id: t.id || String(Math.random()),
                    description: t.description || "Tarea sin descripción",
                    percentageCompleted: t.percentageCompleted || 0,
                    weighting: t.weighting || 0,
                    responsible: t.responsible || "",
                    date: t.date || "",
                  })),
                };
              });

              // % promedio ponderado de OO
              const totalOOPond = ooList.reduce((s: number, rk: any) => s + (rk.ponderacion || 0), 0);
              let pctOO = 0;
              if (totalOOPond > 0) {
                pctOO = ooList.reduce((s: number, rk: any) => s + rk.porcentajeAlcanzado * (rk.ponderacion / totalOOPond), 0);
              } else if (ooList.length > 0) {
                pctOO = ooList.reduce((s: number, rk: any) => s + rk.porcentajeAlcanzado, 0) / ooList.length;
              }

              // % promedio ponderado de Tareas (solo OO que tienen tareas)
              const ooConTareas = ooList.filter((rk: any) => rk.hasTasks);
              let tasksGlobalAvg: number | null = null;
              if (ooConTareas.length > 0) {
                const totalPondTareas = ooConTareas.reduce((s: number, rk: any) => s + (rk.ponderacion || 0), 0);
                if (totalPondTareas > 0) {
                  tasksGlobalAvg = ooConTareas.reduce((s: number, rk: any) => s + (rk.tasksAverage ?? 0) * (rk.ponderacion / totalPondTareas), 0);
                } else {
                  tasksGlobalAvg = ooConTareas.reduce((s: number, rk: any) => s + (rk.tasksAverage ?? 0), 0) / ooConTareas.length;
                }
              }

              oteRows.push({
                id: obj.id,
                name: (obj as any).name || "OTE sin nombre",
                strategicObjective: (obj as any).strategicObjective || "",
                strategicObjectiveDescription: (obj as any).strategicObjectiveDescription || "",
                ponderacion,
                puntoPartida,
                metaLlegada,
                avanceMeta,
                unidadMedida: pd.unidadMedida || "%",
                trackingType: pd.trackingType || "puntual",
                monthlyValues: pd.monthlyValues || {},
                checklistValues: pd.checklistValues || {},
                porcentajeMetaAlcanzado: Math.round(porcentajeMetaAlcanzado),
                pctOO: Math.round(pctOO),
                tasksGlobalAvg: tasksGlobalAvg !== null ? Math.round(tasksGlobalAvg) : null,
                hasOO: ooList.length > 0,
                objetivosOperativos: ooList,
              });
            } catch (e) {
              console.error("Error parsing OTE planning data:", e);
            }
          }

          objetivosTacticosMetaAlcanzada = Math.round(totalPonderado);
        }

        // ── Actividades del proceso ───────────────────────────────────────────
        const compliances = await db.select().from(processCompliances)
          .where(eq(processCompliances.processId, input.processId));

        let cumplimientosPromedio = 0;
        if (compliances.length > 0) {
          cumplimientosPromedio = Math.round(
            compliances.reduce(
              (total, activity) => total + calculateActivityProgress(activity as any),
              0
            ) / compliances.length
          );
        }

        // ── Control y liberación de salidas ───────────────────────────────────
        // La ausencia de controles o de períodos evaluables se conserva como
        // null: no es un 0 % y no debe empeorar el promedio del proceso.
        const outputControls = await db
          .select()
          .from(processOutputReleaseControls)
          .where(eq(processOutputReleaseControls.processId, input.processId));
        const activeOutputControls = outputControls.filter(
          control => control.isActive && !control.archivedAt
        );
        const activeOutputControlIds = activeOutputControls.map(control => control.id);
        const outputPeriods = activeOutputControlIds.length
          ? await db
              .select()
              .from(processOutputReleasePeriods)
              .where(inArray(processOutputReleasePeriods.controlId, activeOutputControlIds))
          : [];
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const evaluableOutputPeriods = outputPeriods.filter(
          period => new Date(period.scheduledDate).getTime() <= today.getTime()
        );
        const releasedOnTime = evaluableOutputPeriods.filter(period => {
          if (period.status !== "released" || !period.releasedAt) return false;
          const deadline = new Date(period.scheduledDate);
          deadline.setHours(23, 59, 59, 999);
          return new Date(period.releasedAt).getTime() <= deadline.getTime();
        }).length;
        const outputReleaseValue = evaluableOutputPeriods.length
          ? Math.round((releasedOnTime / evaluableOutputPeriods.length) * 100)
          : null;
        const outputReleaseStatus = activeOutputControls.length === 0
          ? "no_controls"
          : evaluableOutputPeriods.length === 0
            ? "pending_evaluation"
            : "measured";

        return [
          {
            id: "cumplimiento",
            name: "Gestión con Partes Interesadas",
            indicator: "Porcentaje de cumplimiento",
            value: criticalidadCumplimiento,
            performance: criticalidadCumplimiento,
            plannedActions: criticalityProgress.planned,
            completedActions: criticalityProgress.completed,
          },
          {
            id: "total_alcanzado",
            name: "OTG",
            indicator: "Total alcanzado",
            value: matrizAlcanzado,
            performance: matrizAlcanzado,
            compliance: matrizCumplimiento,
            otgRows,
          },
          {
            id: "comunicado",
            name: "OTG",
            indicator: "%Comunicado",
            value: matrizComunicado,
            performance: matrizComunicado
          },
          {
            id: "alcanzado",
            name: "OTE",
            indicator: "% Meta alcanzada por Objetivos Tácticos",
            value: objetivosTacticosMetaAlcanzada,
            performance: objetivosTacticosMetaAlcanzada,
            oteRows,
          },
          {
            id: "promedio_cumplimiento",
            name: "Actividades",
            indicator: "% promedio de avance",
            value: cumplimientosPromedio,
            performance: cumplimientosPromedio
          },
          {
            id: "control_salidas",
            name: "Control de Salidas",
            indicator: "% de liberaciones realizadas en plazo",
            value: outputReleaseValue,
            performance: outputReleaseValue,
            status: outputReleaseStatus,
            scheduledControls: activeOutputControls.length,
            assessableControls: evaluableOutputPeriods.length,
            releasedOnTime,
            exceptions: evaluableOutputPeriods.filter(period => period.status === "exception").length,
            overdueOpen: evaluableOutputPeriods.filter(period => period.status === "pending").length,
          }
        ];
      } catch (error) {
        console.error("[Consolidated Indicators] Error fetching indicators:", error);
        return [];
      }
    }),
});
