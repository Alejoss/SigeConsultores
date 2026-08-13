import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { companyTrends, processes, processTacticalObjectives, criticalityMatrix, strategicObjectives, stakeholders, processFODA } from "../../drizzle/schema";
import { eq, asc } from "drizzle-orm";
import { calculateCompanyStrategicSnapshot, saveCompanyStrategicSnapshot } from "../lib/strategicSnapshots";

const MONTH_NAMES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

// ─── Helper: calcula % meta alcanzada de un OTE según su tipo de seguimiento ──
// Replica exactamente la lógica de calcOTMetrics del frontend (TacticalPlanning.tsx)
function calcOTEPorcentaje(pd: any): number {
  const pp = parseFloat(pd.puntoPartida) || 0;
  const meta = parseFloat(pd.metaLlegada) || 0;
  const avanceMeta = parseFloat(pd.avanceMeta) || 0;
  const trackingType = pd.trackingType || 'puntual';

  if (trackingType === 'mensual_checklist') {
    const vals: boolean[] = Array.isArray(pd.checklistValues) ? pd.checklistValues : Array(12).fill(false);
    const cumplidos = vals.filter(Boolean).length;
    return Math.round((cumplidos / 12) * 100);
  }
  if (trackingType === 'mensual_sumatoria') {
    const vals: number[] = Array.isArray(pd.monthlyValues) ? pd.monthlyValues : Array(12).fill(0);
    const suma = vals.reduce((s: number, v: number) => s + (v || 0), 0);
    if (meta === pp) return 0;
    return Math.max(0, Math.min(100, Math.round(((suma - pp) / (meta - pp)) * 100)));
  }
  if (trackingType === 'mensual_promedio') {
    const vals: number[] = Array.isArray(pd.monthlyValues) ? pd.monthlyValues : Array(12).fill(0);
    const nonZero = vals.filter((v: number) => v !== 0);
    const promedio = nonZero.length > 0 ? nonZero.reduce((s: number, v: number) => s + v, 0) / nonZero.length : 0;
    if (meta === pp) return 0;
    return Math.max(0, Math.min(100, Math.round(((promedio - pp) / (meta - pp)) * 100)));
  }
  // puntual
  if (meta === pp) return 0;
  return Math.max(0, Math.min(100, Math.round(((avanceMeta - pp) / (meta - pp)) * 100)));
}

export const strategicTrendsRouter = router({
  /**
   * Devuelve todos los snapshots de tendencias para una empresa,
   * ordenados por año y mes. Si no hay datos históricos guardados,
   * calcula el snapshot actual del mes en curso.
   */
  getTrends: companyProcedure
    .input(z.object({
      companyId: z.number(),
      years: z.array(z.number()).optional(), // filtro opcional por años
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { data: [], hasSavedData: false };

      // Obtener snapshots guardados
      const rows = await db
        .select()
        .from(companyTrends)
        .where(eq(companyTrends.companyId, input.companyId))
        .orderBy(asc(companyTrends.year), asc(companyTrends.month));

      if (rows.length > 0) {
        const data = rows.map((r) => {
          let oePercents: Record<string, number> = {};
          try { oePercents = JSON.parse((r as any).oePercentsJson || "{}"); } catch { /* skip */ }
          return {
            year: r.year,
            month: r.month,
            label: `${MONTH_NAMES[r.month - 1]} ${r.year}`,
            otePercent: parseFloat(r.otePercent as string),
            otgPercent: parseFloat(r.otgPercent as string),
            stakeholderPercent: parseFloat(r.stakeholderPercent as string),
            oteMeta: parseFloat(r.oteMeta as string),
            otgMeta: parseFloat(r.otgMeta as string),
            stakeholderMeta: parseFloat(r.stakeholderMeta as string),
            oePercents,
          };
        });
        return { data, hasSavedData: true };
      }

      // Sin datos históricos: calcular el estado actual. El primer snapshot se guarda
      // automáticamente desde la vista de Línea de Tiempo para no perder el mes.
      const snapshot = await calculateCompanyStrategicSnapshot(input.companyId);
      return {
        data: [{
          ...snapshot,
          label: `${MONTH_NAMES[snapshot.month - 1]} ${snapshot.year}`,
        }],
        hasSavedData: false,
      };
    }),

  /**
   * Guarda o actualiza un snapshot mensual para una empresa.
   * Útil para registrar manualmente el estado al cierre de cada mes.
   */
  upsertTrend: companyProcedure
    .input(z.object({
      companyId: z.number(),
      year: z.number(),
      month: z.number().min(1).max(12),
      otePercent: z.number().min(0).max(100),
      otgPercent: z.number().min(0).max(100),
      stakeholderPercent: z.number().min(0).max(100),
      oteMeta: z.number().min(0).max(100).optional().default(100),
      otgMeta: z.number().min(0).max(100).optional().default(100),
      stakeholderMeta: z.number().min(0).max(100).optional().default(100),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .insert(companyTrends)
        .values({
          companyId: input.companyId,
          year: input.year,
          month: input.month,
          otePercent: String(input.otePercent),
          otgPercent: String(input.otgPercent),
          stakeholderPercent: String(input.stakeholderPercent),
          oteMeta: String(input.oteMeta),
          otgMeta: String(input.otgMeta),
          stakeholderMeta: String(input.stakeholderMeta),
        })
        .onDuplicateKeyUpdate({
          set: {
            otePercent: String(input.otePercent),
            otgPercent: String(input.otgPercent),
            stakeholderPercent: String(input.stakeholderPercent),
            oteMeta: String(input.oteMeta),
            otgMeta: String(input.otgMeta),
            stakeholderMeta: String(input.stakeholderMeta),
            updatedAt: new Date(),
          },
        });

      return { success: true };
    }),

  /**
   * Calcula y guarda el snapshot del mes actual con el porcentaje de cada OE.
   * Si el mes ya existe, se actualiza sin crear un registro duplicado.
   */
  snapshotCurrentMonth: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const snapshot = await saveCompanyStrategicSnapshot(input.companyId);
      return {
        success: true,
        otePercent: snapshot.otePercent,
        oteMeta: snapshot.oteMeta,
        stakeholderPercent: snapshot.stakeholderPercent,
        oePercents: snapshot.oePercents,
      };
    }),

  /**
   * Devuelve el desglose de cada OTE individual con su % de avance actual.
   * Agrupa por proceso y por objetivo estratégico.
   */
  getOteBreakdown: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const companyProcesses = await db
        .select()
        .from(processes)
        .where(eq(processes.companyId, input.companyId));

      const result: Array<{
        processId: number;
        processName: string;
        objectives: Array<{
          id: number;
          name: string;
          strategicObjective: string;
          percent: number;
          ponderacion: number;
        }>;
      }> = [];

      for (const proc of companyProcesses) {
        const oteRows = await db
          .select()
          .from(processTacticalObjectives)
          .where(eq(processTacticalObjectives.processId, proc.id));

        if (oteRows.length === 0) continue;

        const objectives = oteRows.map((obj: any) => {
          let percent = 0;
          let ponderacion = 0;
          try {
            const pd = JSON.parse(obj.planningData || "{}");
            ponderacion = parseFloat(pd.ponderacion) || 0;
            // Calcular % usando el tipo de seguimiento correcto
            if (pd.trackingType || pd.puntoPartida !== undefined || pd.metaLlegada !== undefined) {
              percent = calcOTEPorcentaje(pd);
            } else if (pd.resultKeys && Array.isArray(pd.resultKeys)) {
              // Promedio de porcentajeAlcanzado de los resultKeys
              const vals = pd.resultKeys
                .map((rk: any) => parseFloat(rk.porcentajeAlcanzado) || 0)
                .filter((v: number) => !isNaN(v));
              if (vals.length > 0) {
                percent = Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length);
              }
            }
          } catch { /* skip */ }
          return {
            id: obj.id,
            name: obj.name || "Sin nombre",
            strategicObjective: obj.strategicObjective || "Sin clasificar",
            percent,
            ponderacion,
          };
        });

        if (objectives.length > 0) {
          result.push({
            processId: proc.id,
            processName: proc.name,
            objectives,
          });
        }
      }

      return result;
    }),

  /**
   * Devuelve el detalle de un OTE individual: sus resultKeys con porcentajeAlcanzado y meta,
   * para construir la mini gráfica de tendencia por resultado clave.
   */
  getOteDetail: companyProcedure
    .input(z.object({ objectiveId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [obj] = await db
        .select()
        .from(processTacticalObjectives)
        .where(eq(processTacticalObjectives.id, input.objectiveId))
        .limit(1);

      if (!obj) return null;

      try {
        const pd = JSON.parse((obj as any).planningData || "{}");
        const resultKeys = Array.isArray(pd.resultKeys) ? pd.resultKeys : [];

        // Construir puntos para la gráfica: cada resultKey es un punto
        const chartPoints = resultKeys.map((rk: any, idx: number) => {
          const pct = Math.max(0, Math.min(100, parseFloat(rk.porcentajeAlcanzado) || 0));
          const meta = parseFloat(rk.meta);
          const metaVal = !isNaN(meta) ? Math.max(0, Math.min(100, meta)) : 100;
          const label = rk.description
            ? (rk.description.length > 30 ? rk.description.slice(0, 28) + "…" : rk.description)
            : `RK ${idx + 1}`;
          return {
            label,
            fullDescription: rk.description || `Resultado clave ${idx + 1}`,
            avance: pct,
            meta: metaVal,
            ponderacion: parseFloat(rk.ponderacion) || 0,
            responsible: rk.responsible || "",
            endDate: rk.endDate || "",
          };
        });

        // Calcular % global del objetivo y su meta global
        let globalPercent = 0;
        let globalMeta = 100;
        const metaLlegada = parseFloat(pd.metaLlegada) || 0;
        if (pd.trackingType || pd.puntoPartida !== undefined || metaLlegada !== 0) {
          globalPercent = calcOTEPorcentaje(pd);
          globalPercent = Math.max(0, Math.min(100, globalPercent));
          globalMeta = metaLlegada || 100;
        } else if (resultKeys.length > 0) {
          const totalWeight = resultKeys.reduce((s: number, rk: any) => s + (parseFloat(rk.ponderacion) || 0), 0);
          if (totalWeight > 0) {
            globalPercent = resultKeys.reduce((s: number, rk: any) => {
              const w = parseFloat(rk.ponderacion) || 0;
              const p = parseFloat(rk.porcentajeAlcanzado) || 0;
              return s + p * (w / totalWeight);
            }, 0);
            globalPercent = Math.max(0, Math.min(100, Math.round(globalPercent)));
            const metaVals = resultKeys
              .filter((rk: any) => !isNaN(parseFloat(rk.meta)) && (parseFloat(rk.ponderacion) || 0) > 0)
              .map((rk: any) => parseFloat(rk.meta) * ((parseFloat(rk.ponderacion) || 0) / totalWeight));
            if (metaVals.length > 0) {
              globalMeta = Math.round(metaVals.reduce((a: number, b: number) => a + b, 0));
            }
          } else {
            const vals = resultKeys.map((rk: any) => parseFloat(rk.porcentajeAlcanzado) || 0);
            globalPercent = vals.length > 0 ? Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length) : 0;
          }
        }

        return {
          objectiveId: input.objectiveId,
          name: (obj as any).name || "Sin nombre",
          strategicObjective: (obj as any).strategicObjective || "",
          globalPercent,
          globalMeta,
          chartPoints,
          unidadMedida: pd.unidadMedida || "%",
        };
      } catch {
        return null;
      }
    }),

  /**
   * Devuelve el avance de OTE agrupado por Objetivo Estratégico.
   * Para cada OE: % total de cumplimiento y desglose por proceso/área.
   */
  getStrategicObjectivesBreakdown: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { globalPercent: 0, objectives: [], totalOTE: 0 };

      const oeList = await db
        .select()
        .from(strategicObjectives)
        .where(eq(strategicObjectives.companyId, input.companyId))
        .orderBy(asc(strategicObjectives.orderIndex));

      const companyProcesses = await db
        .select()
        .from(processes)
        .where(eq(processes.companyId, input.companyId));

      const allOTE: Array<{ processId: number; processName: string; strategicObjective: string; percent: number; ponderacion: number }> = [];
      for (const proc of companyProcesses) {
        const oteRows = await db
          .select()
          .from(processTacticalObjectives)
          .where(eq(processTacticalObjectives.processId, proc.id));

        for (const obj of oteRows) {
          try {
            const pd = JSON.parse((obj as any).planningData || "{}");
            const ponderacion = parseFloat(pd.ponderacion) || 0;
            let percent = 0;
            if (pd.trackingType || pd.puntoPartida !== undefined || pd.metaLlegada !== undefined) {
              percent = calcOTEPorcentaje(pd);
            } else if (pd.resultKeys && Array.isArray(pd.resultKeys)) {
              const totalW = pd.resultKeys.reduce((s: number, rk: any) => s + (parseFloat(rk.ponderacion) || 0), 0);
              if (totalW > 0) {
                percent = pd.resultKeys.reduce((s: number, rk: any) => {
                  const w = parseFloat(rk.ponderacion) || 0;
                  const p = parseFloat(rk.porcentajeAlcanzado) || 0;
                  return s + p * (w / totalW);
                }, 0);
              } else {
                const vals = pd.resultKeys.map((rk: any) => parseFloat(rk.porcentajeAlcanzado) || 0);
                percent = vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
              }
              percent = Math.max(0, Math.min(100, Math.round(percent)));
            }
            allOTE.push({
              processId: proc.id,
              processName: proc.name,
              strategicObjective: (obj as any).strategicObjective || "",
              percent,
              ponderacion,
            });
          } catch { /* skip */ }
        }
      }

      const totalWeight = allOTE.reduce((s, o) => s + o.ponderacion, 0);
      const globalPercent = totalWeight > 0
        ? Math.round(allOTE.reduce((s, o) => s + o.percent * (o.ponderacion / totalWeight), 0))
        : (allOTE.length > 0 ? Math.round(allOTE.reduce((s, o) => s + o.percent, 0) / allOTE.length) : 0);

      const result = oeList.map((oe, idx) => {
        const oeLabel = oe.objective || `OE ${idx + 1}`;
        const matchingOTE = allOTE.filter((o) => {
          const so = (o.strategicObjective || "").toLowerCase().trim();
          const oel = oeLabel.toLowerCase().trim();
          // Un OTE sin OE asignado no debe aparecer en todas las columnas ni alterar sus porcentajes.
          if (!so) return false;
          return so === oel || so.includes(oel.slice(0, 20)) || oel.includes(so.slice(0, 20));
        });

        const oeWeight = matchingOTE.reduce((s, o) => s + o.ponderacion, 0);
        const oePercent = oeWeight > 0
          ? Math.round(matchingOTE.reduce((s, o) => s + o.percent * (o.ponderacion / oeWeight), 0))
          : (matchingOTE.length > 0 ? Math.round(matchingOTE.reduce((s, o) => s + o.percent, 0) / matchingOTE.length) : 0);

        const processSummary: Record<number, { processId: number; processName: string; percent: number; oteCount: number }> = {};
        for (const o of matchingOTE) {
          if (!processSummary[o.processId]) {
            processSummary[o.processId] = { processId: o.processId, processName: o.processName, percent: 0, oteCount: 0 };
          }
          processSummary[o.processId].percent += o.percent;
          processSummary[o.processId].oteCount++;
        }
        const contributions = Object.values(processSummary).map((p) => ({
          ...p,
          percent: Math.round(p.percent / p.oteCount),
        }));

        return {
          id: oe.id,
          orderIndex: oe.orderIndex,
          name: oeLabel,
          description: oe.description || "",
          percent: oePercent,
          contributions,
          oteCount: matchingOTE.length,
        };
      });

      return { globalPercent, objectives: result, totalOTE: allOTE.length };
    }),

  /**
   * Devuelve el resumen de OTG por proceso/área para Tendencias Estratégicas.
   */
  getOtgByArea: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const companyProcesses = await db
        .select()
        .from(processes)
        .where(eq(processes.companyId, input.companyId));

      const result: Array<{
        processId: number;
        processName: string;
        totalOTG: number;
        logrados: number;
        comunicados: number;
        percent: number;
      }> = [];

      for (const proc of companyProcesses) {
        // Valor por defecto: proceso sin OTG
        let totalOTG = 0;
        let logrados = 0;
        let comunicados = 0;
        let percent = 0;

        const fodaRows = await db
          .select()
          .from(processFODA)
          .where(eq(processFODA.processId, proc.id));

        if (fodaRows.length > 0) {
          const latestFoda = fodaRows.reduce((latest: any, current: any) =>
            new Date(current.createdAt || 0).getTime() > new Date(latest.createdAt || 0).getTime() ? current : latest
          );

          if (latestFoda?.matrixData) {
            try {
              const matrixRows = JSON.parse(latestFoda.matrixData);
              if (Array.isArray(matrixRows) && matrixRows.length > 0) {
                totalOTG = matrixRows.length;
                logrados = matrixRows.filter((r: any) => r.objetivoLogrado === "SI").length;
                comunicados = matrixRows.filter((r: any) => r.comunicado === "SI").length;

                let totalPct = 0;
                let countWithActions = 0;
                for (const row of matrixRows) {
                  const acciones: any[] = Array.isArray(row.acciones) ? row.acciones : [];
                  if (acciones.length === 0) continue;
                  const totalPond = acciones.reduce((s: number, a: any) => s + (a.ponderacion || 0), 0);
                  let pct = 0;
                  if (totalPond > 0) {
                    pct = acciones.reduce((s: number, a: any) => {
                      const alc = parseFloat(a.alcanzado) || 0;
                      return s + alc * (a.ponderacion / totalPond);
                    }, 0);
                  } else {
                    pct = acciones.reduce((s: number, a: any) => s + (parseFloat(a.alcanzado) || 0), 0) / acciones.length;
                  }
                  totalPct += Math.min(100, Math.max(0, pct));
                  countWithActions++;
                }
                percent = countWithActions > 0 ? Math.round(totalPct / countWithActions) : 0;
              }
            } catch { /* skip */ }
          }
        }

        result.push({
          processId: proc.id,
          processName: proc.name,
          totalOTG,
          logrados,
          comunicados,
          percent,
        });
      }

      return result;
    }),

  /**
   * Devuelve el resumen de Partes Interesadas por proceso/área.
   */
  getStakeholdersByArea: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const companyProcesses = await db
        .select()
        .from(processes)
        .where(eq(processes.companyId, input.companyId));

      const result: Array<{
        processId: number;
        processName: string;
        totalStakeholders: number;
        implemented: number;
        percentImplemented: number;
        internalCount: number;
        externalCount: number;
      }> = [];

      for (const proc of companyProcesses) {
        const stRows = await db
          .select()
          .from(stakeholders)
          .where(eq(stakeholders.processId, proc.id));

        const critRows = stRows.length > 0
          ? await db
              .select()
              .from(criticalityMatrix)
              .where(eq(criticalityMatrix.processId, proc.id))
          : [];

        const implemented = critRows.filter((c: any) => c.implementationStatus === true).length;
        const percentImplemented = critRows.length > 0
          ? Math.round((implemented / critRows.length) * 100)
          : 0;

        const internalCount = (stRows as any[]).filter((s: any) => s.isInternal === true || s.isInternal === 1).length;
        const externalCount = stRows.length - internalCount;

        result.push({
          processId: proc.id,
          processName: proc.name,
          totalStakeholders: stRows.length,
          implemented,
          percentImplemented,
          internalCount,
          externalCount,
        });
      }

      return result;
    }),
});

