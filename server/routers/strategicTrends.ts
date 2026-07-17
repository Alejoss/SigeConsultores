import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { companyTrends, processes, processTacticalObjectives, criticalityMatrix } from "../../drizzle/schema";
import { eq, asc } from "drizzle-orm";

const MONTH_NAMES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

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
        const data = rows.map((r) => ({
          year: r.year,
          month: r.month,
          label: `${MONTH_NAMES[r.month - 1]} ${r.year}`,
          otePercent: parseFloat(r.otePercent as string),
          otgPercent: parseFloat(r.otgPercent as string),
          stakeholderPercent: parseFloat(r.stakeholderPercent as string),
          oteMeta: parseFloat(r.oteMeta as string),
          otgMeta: parseFloat(r.otgMeta as string),
          stakeholderMeta: parseFloat(r.stakeholderMeta as string),
        }));
        return { data, hasSavedData: true };
      }

      // Sin datos históricos: calcular snapshot actual
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      const companyProcesses = await db
        .select()
        .from(processes)
        .where(eq(processes.companyId, input.companyId));

      if (companyProcesses.length === 0) {
        return { data: [], hasSavedData: false };
      }

      // Calcular OTE promedio de todos los procesos
      let totalOte = 0;
      let totalOteMeta = 0;
      let totalStakeholder = 0;
      let processCount = 0;
      let oteMetaCount = 0;

      for (const proc of companyProcesses) {
        // OTE
        const oteRows = await db
          .select()
          .from(processTacticalObjectives)
          .where(eq(processTacticalObjectives.processId, proc.id));

        let procOte = 0;
        let procOteWeight = 0;
        let procOteMeta = 0;
        let procOteMetaWeight = 0;
        for (const obj of oteRows) {
          try {
            const pd = JSON.parse(obj.planningData as string || "{}");
            const resultKeys = pd.resultKeys || [];
            for (const rk of resultKeys) {
              const ponderacion = parseFloat(rk.ponderacion) || 0;
              const pct = parseFloat(rk.porcentajeAlcanzado) || 0;
              const meta = parseFloat(rk.meta);
              procOte += pct * (ponderacion / 100);
              procOteWeight += ponderacion;
              // Acumular meta ponderada si está definida
              if (!isNaN(meta) && ponderacion > 0) {
                procOteMeta += meta * (ponderacion / 100);
                procOteMetaWeight += ponderacion;
              }
            }
          } catch { /* skip */ }
        }
        if (procOteWeight > 0) {
          totalOte += Math.max(0, Math.min(100, procOte));
          processCount++;
        }
        if (procOteMetaWeight > 0) {
          totalOteMeta += Math.max(0, Math.min(100, procOteMeta));
          oteMetaCount++;
        }

        // Partes Interesadas
        const critRows = await db
          .select()
          .from(criticalityMatrix)
          .where(eq(criticalityMatrix.processId, proc.id));

        if (critRows.length > 0) {
          const implemented = critRows.filter((c: any) => c.implementationStatus === true).length;
          totalStakeholder += Math.round((implemented / critRows.length) * 100);
        }
      }

      const avgOte = processCount > 0 ? Math.round(totalOte / processCount) : 0;
      // Meta OTE: promedio real de metas de los resultKeys; si no hay metas definidas, usa 100
      const avgOteMeta = oteMetaCount > 0 ? Math.round(totalOteMeta / oteMetaCount) : 100;
      const avgStakeholder = companyProcesses.length > 0
        ? Math.round(totalStakeholder / companyProcesses.length)
        : 0;

      const snapshot = {
        year: currentYear,
        month: currentMonth,
        label: `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`,
        otePercent: avgOte,
        otgPercent: 0, // OTG requiere datos de tareas completadas
        stakeholderPercent: avgStakeholder,
        oteMeta: avgOteMeta,
        otgMeta: 100,
        stakeholderMeta: 100,
      };

      return { data: [snapshot], hasSavedData: false };
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
   * Calcula y guarda automáticamente el snapshot del mes actual
   * basándose en los datos reales de la empresa.
   */
  snapshotCurrentMonth: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const companyProcesses = await db
        .select()
        .from(processes)
        .where(eq(processes.companyId, input.companyId));

      let totalOte = 0;
      let totalOteMeta = 0;
      let totalStakeholder = 0;
      let oteProcessCount = 0;
      let oteMetaCount = 0;

      for (const proc of companyProcesses) {
        const oteRows = await db
          .select()
          .from(processTacticalObjectives)
          .where(eq(processTacticalObjectives.processId, proc.id));

        let procOte = 0;
        let procOteWeight = 0;
        let procOteMeta = 0;
        let procOteMetaWeight = 0;
        for (const obj of oteRows) {
          try {
            const pd = JSON.parse(obj.planningData as string || "{}");
            const resultKeys = pd.resultKeys || [];
            for (const rk of resultKeys) {
              const ponderacion = parseFloat(rk.ponderacion) || 0;
              const pct = parseFloat(rk.porcentajeAlcanzado) || 0;
              const meta = parseFloat(rk.meta);
              procOte += pct * (ponderacion / 100);
              procOteWeight += ponderacion;
              if (!isNaN(meta) && ponderacion > 0) {
                procOteMeta += meta * (ponderacion / 100);
                procOteMetaWeight += ponderacion;
              }
            }
          } catch { /* skip */ }
        }
        if (procOteWeight > 0) {
          totalOte += Math.max(0, Math.min(100, procOte));
          oteProcessCount++;
        }
        if (procOteMetaWeight > 0) {
          totalOteMeta += Math.max(0, Math.min(100, procOteMeta));
          oteMetaCount++;
        }

        const critRows = await db
          .select()
          .from(criticalityMatrix)
          .where(eq(criticalityMatrix.processId, proc.id));

        if (critRows.length > 0) {
          const implemented = critRows.filter((c: any) => c.implementationStatus === true).length;
          totalStakeholder += Math.round((implemented / critRows.length) * 100);
        }
      }

      const avgOte = oteProcessCount > 0 ? Math.round(totalOte / oteProcessCount) : 0;
      const avgOteMeta = oteMetaCount > 0 ? Math.round(totalOteMeta / oteMetaCount) : 100;
      const avgStakeholder = companyProcesses.length > 0
        ? Math.round(totalStakeholder / companyProcesses.length)
        : 0;

      await db
        .insert(companyTrends)
        .values({
          companyId: input.companyId,
          year,
          month,
          otePercent: String(avgOte),
          otgPercent: "0",
          stakeholderPercent: String(avgStakeholder),
          oteMeta: String(avgOteMeta),
          otgMeta: "100",
          stakeholderMeta: "100",
        })
        .onDuplicateKeyUpdate({
          set: {
            otePercent: String(avgOte),
            oteMeta: String(avgOteMeta),
            stakeholderPercent: String(avgStakeholder),
            updatedAt: new Date(),
          },
        });

      return { success: true, otePercent: avgOte, oteMeta: avgOteMeta, stakeholderPercent: avgStakeholder };
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
            const puntoPartida = parseFloat(pd.puntoPartida) || 0;
            const metaLlegada = parseFloat(pd.metaLlegada) || 0;
            const avanceMeta = parseFloat(pd.avanceMeta) || 0;
            // Calcular desde resultKeys si no hay puntoPartida/metaLlegada directos
            if (metaLlegada !== puntoPartida && metaLlegada !== 0) {
              percent = ((avanceMeta - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
              percent = Math.max(0, Math.min(100, Math.round(percent)));
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
        const puntoPartida = parseFloat(pd.puntoPartida) || 0;
        const metaLlegada = parseFloat(pd.metaLlegada) || 0;
        const avanceMeta = parseFloat(pd.avanceMeta) || 0;
        if (metaLlegada !== puntoPartida && metaLlegada !== 0) {
          globalPercent = ((avanceMeta - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
          globalPercent = Math.max(0, Math.min(100, Math.round(globalPercent)));
          globalMeta = metaLlegada;
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
});
