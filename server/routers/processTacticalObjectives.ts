import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { policies, policyObjectives, processTacticalObjectives } from "../../drizzle/schema";
import { and, desc, eq, or } from "drizzle-orm";
import { updateProcessTacticalObjective } from "../db";
import { assertProcessAccessById, assertProcessTacticalObjectiveAccess } from "../_core/companyPermissions";

const objectiveNarrativeFields = {
  situacionInicial: z.string().max(10_000).optional(),
  resultadoEsperado: z.string().max(10_000).optional(),
  indicador: z.string().max(10_000).optional(),
};

type ObjectiveNarratives = {
  situacionInicial?: string;
  resultadoEsperado?: string;
  indicador?: string;
};

/** Omitted fields must not create or clear historical JSON keys; '' is explicit. */
function suppliedNarratives(input: ObjectiveNarratives): ObjectiveNarratives {
  return {
    ...(input.situacionInicial !== undefined ? { situacionInicial: input.situacionInicial } : {}),
    ...(input.resultadoEsperado !== undefined ? { resultadoEsperado: input.resultadoEsperado } : {}),
    ...(input.indicador !== undefined ? { indicador: input.indicador } : {}),
  };
}

/** Empty-string fallbacks belong to the response only, never to persistence. */
function readNarratives(planningData: any): Required<ObjectiveNarratives> {
  return {
    situacionInicial: typeof planningData?.situacionInicial === "string" ? planningData.situacionInicial : "",
    resultadoEsperado: typeof planningData?.resultadoEsperado === "string" ? planningData.resultadoEsperado : "",
    indicador: typeof planningData?.indicador === "string" ? planningData.indicador : "",
  };
}

/**
 * Resuelve el Objetivo de la Política seleccionado y comprueba que pertenezca a
 * la misma empresa del proceso. Incluye registros históricos guardados con el
 * companyId en policyId, igual que la pantalla corporativa de Política.
 */
async function resolvePolicyObjectiveForCompany(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  policyObjectiveId: number
) {
  const [companyPolicy] = await db
    .select({ id: policies.id })
    .from(policies)
    .where(eq(policies.companyId, companyId))
    .limit(1);

  const companyOwnership = companyPolicy
    ? or(
        eq(policyObjectives.policyId, companyPolicy.id),
        eq(policyObjectives.policyId, companyId)
      )
    : eq(policyObjectives.policyId, companyId);

  const [objective] = await db
    .select({
      id: policyObjectives.id,
      objective: policyObjectives.objective,
      description: policyObjectives.description,
    })
    .from(policyObjectives)
    .where(and(eq(policyObjectives.id, policyObjectiveId), companyOwnership))
    .limit(1);

  if (!objective) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "El Objetivo de la Política seleccionado no pertenece a la empresa de este proceso.",
    });
  }

  return objective;
}

export const processTacticalObjectivesRouter = router({
  list: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertProcessAccessById(ctx, input.processId);
      const db = await getDb();
      if (!db) return [];

      const result = await db.select().from(processTacticalObjectives)
        .where(eq(processTacticalObjectives.processId, input.processId));

      return result.map((obj: any) => {
        // Extract additional fields from planningData JSON
        let planningData: any = {};
        try {
          if (obj.planningData) {
            planningData = JSON.parse(obj.planningData);
          }
        } catch (e) {
          console.error('Error parsing planningData:', e);
        }
        
        return {
          ...obj,
          ...readNarratives(planningData),
          ponderacion: planningData.ponderacion || 0,
          puntoPartida: planningData.puntoPartida || 0,
          metaLlegada: planningData.metaLlegada || 0,
          unidadMedida: planningData.unidadMedida || '',
          avanceMeta: obj.avanceMeta ? parseFloat(obj.avanceMeta) : 0,
        };
      });
    }),

  create: companyProcedure
    .input(z.object({
      processId: z.number(),
      ...objectiveNarrativeFields,
      name: z.string(),
      description: z.string().optional(),
      target: z.string().optional(),
      responsible: z.string().optional(),
      deadline: z.date().optional(),
      subprocess: z.string().optional(),
      policyObjectiveId: z.number().int().positive().nullable().optional(),
      strategicObjective: z.string().optional(),
      strategicObjectiveDescription: z.string().optional(),
      ponderacion: z.number().optional(),
      puntoPartida: z.number().optional(),
      metaLlegada: z.number().optional(),
      unidadMedida: z.string().optional(),
      planningData: z.string().optional(),
      completed: z.enum(["SI", "NO"]).optional().default("NO"),
    }))
    .mutation(async ({ input, ctx }) => {
      const process = await assertProcessAccessById(ctx, input.processId);
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const selectedPolicyObjective = input.policyObjectiveId
        ? await resolvePolicyObjectiveForCompany(db, process.companyId, input.policyObjectiveId)
        : null;

      const completedValue = input.completed || "NO";
      try {
        console.log('[DEBUG CREATE] Input:', input);
        // Store additional fields in planningData as JSON with merge logic
        const existingPlanningData = input.planningData ? JSON.parse(input.planningData) : {};
        const planningDataObj = {
          ...existingPlanningData,
          ...suppliedNarratives(input),
          ponderacion: input.ponderacion !== undefined ? input.ponderacion : (existingPlanningData.ponderacion || 0),
          puntoPartida: input.puntoPartida !== undefined ? input.puntoPartida : (existingPlanningData.puntoPartida || 0),
          metaLlegada: input.metaLlegada !== undefined ? input.metaLlegada : (existingPlanningData.metaLlegada || 0),
          unidadMedida: input.unidadMedida !== undefined ? input.unidadMedida : (existingPlanningData.unidadMedida || ''),
        };
        
        await db.insert(processTacticalObjectives).values({
          processId: input.processId,
          name: input.name,
          description: input.description || null,
          target: input.target || null,
          responsible: input.responsible || null,
          deadline: input.deadline || null,
          subprocess: input.subprocess || null,
          policyObjectiveId: selectedPolicyObjective?.id ?? null,
          policyObjective: selectedPolicyObjective?.objective ?? null,
          policyObjectiveDescription: selectedPolicyObjective?.description ?? null,
          strategicObjective: input.strategicObjective || null,
          strategicObjectiveDescription: input.strategicObjectiveDescription || null,
          planningData: JSON.stringify(planningDataObj),
          completed: completedValue as any,
        });

        const inserted = await db
          .select({ id: processTacticalObjectives.id })
          .from(processTacticalObjectives)
          .where(eq(processTacticalObjectives.processId, input.processId))
          .orderBy(desc(processTacticalObjectives.id))
          .limit(1);

        const newId = inserted[0]?.id;
        if (!newId) {
          throw new Error("No se pudo obtener el ID del objetivo creado");
        }

        console.log('[DEBUG CREATE] Success, id:', newId);
        return { success: true, id: newId, message: "Objetivo táctico creado exitosamente" };
      } catch (err) {
        console.error('[ERROR CREATE]', err);
        throw err;
      }
    }),

  update: companyProcedure
    .input(z.object({
      objectiveId: z.number(),
      ...objectiveNarrativeFields,
      name: z.string(),
      description: z.string().optional(),
      target: z.string().optional(),
      responsible: z.string().optional(),
      deadline: z.date().optional(),
      subprocess: z.string().optional(),
      policyObjectiveId: z.number().int().positive().nullable().optional(),
      strategicObjective: z.string().optional(),
      strategicObjectiveDescription: z.string().optional(),
      ponderacion: z.number().optional(),
      puntoPartida: z.number().optional(),
      metaLlegada: z.number().optional(),
      unidadMedida: z.string().optional(),
      planningData: z.string().optional(),
      completed: z.enum(["SI", "NO"]).optional().default("NO"),
    }))
    .mutation(async ({ input, ctx }) => {
      const process = await assertProcessTacticalObjectiveAccess(ctx, input.objectiveId);
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const completedValue = input.completed || "NO";
      
      return db.transaction(async tx => {
      // FIX: Get existing planning data to preserve all fields (category, goal, resultKeys, avanceMeta, etc.)
      const existing = await tx.select().from(processTacticalObjectives)
        .where(eq(processTacticalObjectives.id, input.objectiveId))
        .limit(1)
        .for("update");

      const existingPlanningData = existing.length > 0 && existing[0].planningData
        ? JSON.parse(existing[0].planningData)
        : {};

      const selectedPolicyObjective = input.policyObjectiveId === undefined
        ? undefined
        : input.policyObjectiveId
          ? await resolvePolicyObjectiveForCompany(db, process.companyId, input.policyObjectiveId)
          : null;

      // Merge logic: preserve existing planning data, only update provided fields
      const planningDataObj = {
        ...existingPlanningData,
        ...suppliedNarratives(input),
        ponderacion: input.ponderacion !== undefined ? input.ponderacion : (existingPlanningData.ponderacion || 0),
        puntoPartida: input.puntoPartida !== undefined ? input.puntoPartida : (existingPlanningData.puntoPartida || 0),
        metaLlegada: input.metaLlegada !== undefined ? input.metaLlegada : (existingPlanningData.metaLlegada || 0),
        unidadMedida: input.unidadMedida !== undefined ? input.unidadMedida : (existingPlanningData.unidadMedida || ''),
      };
      
      await tx.update(processTacticalObjectives)
        .set({
          name: input.name,
          description: input.description || null,
          target: input.target === undefined ? existing[0].target : input.target || null,
          responsible: input.responsible || null,
          deadline: input.deadline || null,
          // Los OTE históricos conservan el subproceso con el que fueron creados.
          subprocess: input.subprocess === undefined ? existing[0].subprocess : input.subprocess || null,
          ...(selectedPolicyObjective === undefined
            ? {}
            : {
                policyObjectiveId: selectedPolicyObjective?.id ?? null,
                policyObjective: selectedPolicyObjective?.objective ?? null,
                policyObjectiveDescription: selectedPolicyObjective?.description ?? null,
              }),
          strategicObjective: input.strategicObjective || null,
          strategicObjectiveDescription: input.strategicObjectiveDescription || null,
          planningData: JSON.stringify(planningDataObj),
          completed: completedValue as any,
          updatedAt: new Date(),
        })
        .where(eq(processTacticalObjectives.id, input.objectiveId));

      return { success: true, message: "Objetivo táctico actualizado exitosamente" };
      });
    }),

  saveNarratives: companyProcedure
    .input(z.object({
      objectiveId: z.number(),
      ...objectiveNarrativeFields,
    }))
    .mutation(async ({ input, ctx }) => {
      await assertProcessTacticalObjectiveAccess(ctx, input.objectiveId);
      const narratives = suppliedNarratives(input);
      if (Object.keys(narratives).length === 0) {
        return { success: true, changed: false, message: "Sin cambios narrativos" };
      }

      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return db.transaction(async tx => {
        const [existing] = await tx.select().from(processTacticalObjectives)
          .where(eq(processTacticalObjectives.id, input.objectiveId))
          .limit(1)
          .for("update");
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Objetivo táctico no encontrado." });
        }

        let planningData: Record<string, unknown>;
        try {
          const parsed = existing.planningData === null ? {} : JSON.parse(existing.planningData);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("not-object");
          }
          planningData = parsed;
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "La planificación existente no tiene un JSON válido; no se modificaron los textos.",
          });
        }

        await tx.update(processTacticalObjectives)
          .set({
            planningData: JSON.stringify({ ...planningData, ...narratives }),
            // Preserve column metadata too: this endpoint changes only JSON narratives.
            updatedAt: existing.updatedAt,
          })
          .where(eq(processTacticalObjectives.id, input.objectiveId));

        return { success: true, changed: true, message: "Textos del objetivo táctico guardados" };
      });
    }),

  delete: companyProcedure
    .input(z.object({ objectiveId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertProcessTacticalObjectiveAccess(ctx, input.objectiveId);
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(processTacticalObjectives)
        .where(eq(processTacticalObjectives.id, input.objectiveId));

      return { success: true, message: "Objetivo táctico eliminado exitosamente" };
    }),

  savePlanning: companyProcedure
    .input(z.object({
      objectiveId: z.number(),
      ...objectiveNarrativeFields,
      category: z.string().optional(),
      goal: z.string().optional(),
      resultKeys: z.any().optional(),
      ponderacion: z.number().optional(),
      puntoPartida: z.number().optional(),
      metaLlegada: z.number().optional(),
      unidadMedida: z.string().optional(),
      avanceMeta: z.number().optional(),
      trackingType: z.enum(['puntual', 'mensual_sumatoria', 'mensual_promedio', 'mensual_checklist']).optional(),
      monthlyValues: z.array(z.number()).optional(),
      checklistValues: z.array(z.boolean()).optional(),
      puntualSumValues: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertProcessTacticalObjectiveAccess(ctx, input.objectiveId);
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        return await db.transaction(async tx => {
        // Get existing planning data to preserve all fields
        const existing = await tx.select().from(processTacticalObjectives)
          .where(eq(processTacticalObjectives.id, input.objectiveId))
          .limit(1)
          .for("update");

        const existingPlanningData = existing.length > 0 && existing[0].planningData
          ? JSON.parse(existing[0].planningData)
          : {};

        // Helper function to sanitize data for JSON serialization
        const sanitizeForJSON = (obj: any): any => {
          if (obj === null || obj === undefined) return null;
          if (typeof obj !== 'object') return obj;
          if (Array.isArray(obj)) {
            return obj.map(item => sanitizeForJSON(item));
          }
          const sanitized: any = {};
          for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
              const value = obj[key];
              if (value === undefined) {
                // Skip undefined values
                continue;
              } else if (value === null) {
                sanitized[key] = null;
              } else if (typeof value === 'object') {
                sanitized[key] = sanitizeForJSON(value);
              } else if (typeof value === 'function') {
                // Skip functions
                continue;
              } else {
                sanitized[key] = value;
              }
            }
          }
          return sanitized;
        };

        // Merge with new data, preserving existing fields
        const planningData = {
          ...existingPlanningData,
          ...suppliedNarratives(input),
          category: input.category !== undefined ? input.category : (existingPlanningData.category || ''),
          goal: input.goal !== undefined ? input.goal : (existingPlanningData.goal || ''),
          resultKeys: input.resultKeys !== undefined ? sanitizeForJSON(input.resultKeys) : (existingPlanningData.resultKeys || []),
          ponderacion: input.ponderacion !== undefined ? input.ponderacion : (existingPlanningData.ponderacion || 0),
          puntoPartida: input.puntoPartida !== undefined ? input.puntoPartida : (existingPlanningData.puntoPartida || 0),
          metaLlegada: input.metaLlegada !== undefined ? input.metaLlegada : (existingPlanningData.metaLlegada || 0),
          unidadMedida: input.unidadMedida !== undefined ? input.unidadMedida : (existingPlanningData.unidadMedida || ''),
          avanceMeta: input.avanceMeta !== undefined ? input.avanceMeta : (existingPlanningData.avanceMeta || 0),
          trackingType: input.trackingType !== undefined ? input.trackingType : (existingPlanningData.trackingType || 'puntual'),
          monthlyValues: input.monthlyValues !== undefined ? input.monthlyValues : (existingPlanningData.monthlyValues || []),
          checklistValues: input.checklistValues !== undefined ? input.checklistValues : (existingPlanningData.checklistValues || []),
          puntualSumValues: input.puntualSumValues !== undefined ? input.puntualSumValues : (existingPlanningData.puntualSumValues || []),
        };

        // Validate JSON can be stringified
        const jsonString = JSON.stringify(planningData);
        if (!jsonString || jsonString.length === 0) {
          throw new Error('Failed to serialize planning data to JSON');
        }

        // Store planning data as JSON in the planningData field
        await tx.update(processTacticalObjectives)
          .set({
            planningData: jsonString as any,
            updatedAt: new Date(),
          })
          .where(eq(processTacticalObjectives.id, input.objectiveId));

        return { success: true, message: "Planificación guardada" };
        });
      } catch (error) {
        console.error('[savePlanning] Error:', error);
        throw error;
      }
    }),

  loadPlanningData: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertProcessAccessById(ctx, input.processId);
      const db = await getDb();
      if (!db) return [];

      const result = await db.select().from(processTacticalObjectives)
        .where(eq(processTacticalObjectives.processId, input.processId));

      const calcPorcentajeAlcanzado = (ci: number, m: number, ca: number): number => {
        if (m === ci) return 0;
        const pct = ((ca - ci) / (m - ci)) * 100;
        return Math.max(-100, Math.min(100, pct));
      };

      return result.map(obj => {
        try {
          const planningData = obj.planningData
            ? JSON.parse(obj.planningData)
            : { category: '', goal: 0, resultKeys: [] };
          
          // Use planning data values (all these fields are stored in planningData JSON)
          const ponderacion = planningData.ponderacion || 0;
          const puntoPartida = planningData.puntoPartida || 0;
          const metaLlegada = planningData.metaLlegada || 0;
          const unidadMedida = planningData.unidadMedida || '';
          const trackingType = planningData.trackingType || 'puntual';
          // Normalizar siempre a 12 elementos para evitar arrays sparse
          const rawMonthly: number[] = planningData.monthlyValues || [];
          const monthlyValues: number[] = Array(12).fill(0).map((_, i) => Number(rawMonthly[i] || 0));
          const rawChecklist: boolean[] = planningData.checklistValues || [];
          const checklistValues: boolean[] = Array(12).fill(false).map((_, i) => Boolean(rawChecklist[i] || false));

          // Recalcular avanceMeta desde los valores fuente para garantizar consistencia
          let avanceMeta = planningData.avanceMeta || 0;
          if (trackingType === 'mensual_sumatoria') {
            avanceMeta = monthlyValues.reduce((s: number, v: number) => s + (v || 0), 0);
          } else if (trackingType === 'mensual_promedio') {
            const nonZero = monthlyValues.filter((v: number) => v !== 0);
            avanceMeta = nonZero.length > 0 ? nonZero.reduce((s: number, v: number) => s + v, 0) / nonZero.length : 0;
          } else if (trackingType === 'mensual_checklist') {
            avanceMeta = checklistValues.filter(Boolean).length;
          }
          
          // Calculate porcentajeMetaAlcanzado correctly
          let porcentajeMetaAlcanzado = 0;
          if (trackingType === 'mensual_checklist') {
            porcentajeMetaAlcanzado = Math.round((avanceMeta / 12) * 100);
          } else if (metaLlegada !== puntoPartida) {
            porcentajeMetaAlcanzado = ((avanceMeta - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
            porcentajeMetaAlcanzado = Math.max(-100, Math.min(100, porcentajeMetaAlcanzado));
          }

          const resultKeys = (planningData.resultKeys || []).map((rk: any) => {
            const ci = Number(rk.condicionInicial) || 0;
            const m = Number(rk.meta) || 0;
            const ca = Number(rk.condicionActual) || 0;
            const porcentajeAlcanzado =
              rk.porcentajeAlcanzado !== undefined && rk.porcentajeAlcanzado !== null
                ? Number(rk.porcentajeAlcanzado)
                : calcPorcentajeAlcanzado(ci, m, ca);
            // Normalizar ooMonthlyValues y ooChecklistValues a 12 elementos
            const rawOoMonthly: number[] = rk.ooMonthlyValues || [];
            const ooMonthlyValues: number[] = Array(12).fill(0).map((_, i) => Number(rawOoMonthly[i] || 0));
            const rawOoChecklist: boolean[] = rk.ooChecklistValues || [];
            const ooChecklistValues: boolean[] = Array(12).fill(false).map((_, i) => Boolean(rawOoChecklist[i] || false));
            return { ...rk, porcentajeAlcanzado, ooMonthlyValues, ooChecklistValues };
          });
          
          return {
            id: `planning_${obj.id}`,
            objectiveId: obj.id,
            objectiveName: obj.name || '',
            ...readNarratives(planningData),
            objectiveEnunciation: obj.name || '',
            objectiveExplanation: obj.description || '',
            objectiveResponsible: obj.responsible || '',
            policyObjective: obj.policyObjective || '',
            strategicObjective: obj.strategicObjective || '',
            category: planningData.category || '',
            goal: planningData.goal ? String(planningData.goal) : '',
            resultKeys,
            expanded: false,
            ponderacion,
            puntoPartida,
            metaLlegada,
            unidadMedida,
            avanceMeta,
            porcentajeMetaAlcanzado,
            trackingType,
            monthlyValues,
            checklistValues,
            puntualSumValues: planningData.puntualSumValues || [],
          };
        } catch (e) {
          console.error('[loadPlanningData] Error parsing planning data:', e);
          // Fallback: return empty planning data
          return {
            id: `planning_${obj.id}`,
            objectiveId: obj.id,
            objectiveName: obj.name || '',
            ...readNarratives(undefined),
            objectiveEnunciation: obj.name || '',
            objectiveExplanation: obj.description || '',
            objectiveResponsible: obj.responsible || '',
            policyObjective: obj.policyObjective || '',
            strategicObjective: obj.strategicObjective || '',
            category: '',
            goal: '',
            resultKeys: [],
            expanded: false,
            ponderacion: 0,
            puntoPartida: 0,
            metaLlegada: 0,
            unidadMedida: '',
            avanceMeta: 0,
            porcentajeMetaAlcanzado: 0,
          };
        }
      });
    }),
});
