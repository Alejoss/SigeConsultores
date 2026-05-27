import { z } from "zod";
import { protectedProcedure, router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { processTacticalObjectives } from "../../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { updateProcessTacticalObjective } from "../db";

export const processTacticalObjectivesRouter = router({
  list: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
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
      name: z.string(),
      description: z.string().optional(),
      target: z.string().optional(),
      responsible: z.string().optional(),
      deadline: z.date().optional(),
      subprocess: z.string().optional(),
      strategicObjective: z.string().optional(),
      strategicObjectiveDescription: z.string().optional(),
      ponderacion: z.number().optional(),
      puntoPartida: z.number().optional(),
      metaLlegada: z.number().optional(),
      unidadMedida: z.string().optional(),
      planningData: z.string().optional(),
      completed: z.enum(["SI", "NO"]).optional().default("NO"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const completedValue = input.completed || "NO";
      try {
        console.log('[DEBUG CREATE] Input:', input);
        // Store additional fields in planningData as JSON with merge logic
        const existingPlanningData = input.planningData ? JSON.parse(input.planningData) : {};
        const planningDataObj = {
          ...existingPlanningData,
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
      name: z.string(),
      description: z.string().optional(),
      target: z.string().optional(),
      responsible: z.string().optional(),
      deadline: z.date().optional(),
      subprocess: z.string().optional(),
      strategicObjective: z.string().optional(),
      strategicObjectiveDescription: z.string().optional(),
      ponderacion: z.number().optional(),
      puntoPartida: z.number().optional(),
      metaLlegada: z.number().optional(),
      unidadMedida: z.string().optional(),
      planningData: z.string().optional(),
      completed: z.enum(["SI", "NO"]).optional().default("NO"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const completedValue = input.completed || "NO";
      
      // FIX: Get existing planning data to preserve all fields (category, goal, resultKeys, avanceMeta, etc.)
      const existing = await db.select().from(processTacticalObjectives)
        .where(eq(processTacticalObjectives.id, input.objectiveId))
        .limit(1);

      const existingPlanningData = existing.length > 0 && existing[0].planningData
        ? JSON.parse(existing[0].planningData)
        : {};

      // Merge logic: preserve existing planning data, only update provided fields
      const planningDataObj = {
        ...existingPlanningData,
        ponderacion: input.ponderacion !== undefined ? input.ponderacion : (existingPlanningData.ponderacion || 0),
        puntoPartida: input.puntoPartida !== undefined ? input.puntoPartida : (existingPlanningData.puntoPartida || 0),
        metaLlegada: input.metaLlegada !== undefined ? input.metaLlegada : (existingPlanningData.metaLlegada || 0),
        unidadMedida: input.unidadMedida !== undefined ? input.unidadMedida : (existingPlanningData.unidadMedida || ''),
      };
      
      await db.update(processTacticalObjectives)
        .set({
          name: input.name,
          description: input.description || null,
          target: input.target || null,
          responsible: input.responsible || null,
          deadline: input.deadline || null,
          subprocess: input.subprocess || null,
          strategicObjective: input.strategicObjective || null,
          strategicObjectiveDescription: input.strategicObjectiveDescription || null,
          planningData: JSON.stringify(planningDataObj),
          completed: completedValue as any,
          updatedAt: new Date(),
        })
        .where(eq(processTacticalObjectives.id, input.objectiveId));

      return { success: true, message: "Objetivo táctico actualizado exitosamente" };
    }),

  delete: companyProcedure
    .input(z.object({ objectiveId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(processTacticalObjectives)
        .where(eq(processTacticalObjectives.id, input.objectiveId));

      return { success: true, message: "Objetivo táctico eliminado exitosamente" };
    }),

  savePlanning: companyProcedure
    .input(z.object({
      objectiveId: z.number(),
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        // Get existing planning data to preserve all fields
        const existing = await db.select().from(processTacticalObjectives)
          .where(eq(processTacticalObjectives.id, input.objectiveId))
          .limit(1);

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
        await db.update(processTacticalObjectives)
          .set({
            planningData: jsonString as any,
            updatedAt: new Date(),
          })
          .where(eq(processTacticalObjectives.id, input.objectiveId));

        return { success: true, message: "Planificación guardada" };
      } catch (error) {
        console.error('[savePlanning] Error:', error);
        throw error;
      }
    }),

  loadPlanningData: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
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
          const avanceMeta = planningData.avanceMeta || 0;
          const unidadMedida = planningData.unidadMedida || '';
          
          // Calculate porcentajeMetaAlcanzado correctly
          let porcentajeMetaAlcanzado = 0;
          if (metaLlegada !== puntoPartida) {
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
            return { ...rk, porcentajeAlcanzado };
          });
          
          return {
            id: `planning_${obj.id}`,
            objectiveId: obj.id,
            objectiveName: obj.name || '',
            objectiveEnunciation: obj.name || '',
            objectiveExplanation: obj.description || '',
            objectiveResponsible: obj.responsible || '',
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
            trackingType: planningData.trackingType || 'puntual',
            monthlyValues: planningData.monthlyValues || [],
            checklistValues: planningData.checklistValues || [],
            puntualSumValues: planningData.puntualSumValues || [],
          };
        } catch (e) {
          console.error('[loadPlanningData] Error parsing planning data:', e);
          // Fallback: return empty planning data
          return {
            id: `planning_${obj.id}`,
            objectiveId: obj.id,
            objectiveName: obj.name || '',
            objectiveEnunciation: obj.name || '',
            objectiveExplanation: obj.description || '',
            objectiveResponsible: obj.responsible || '',
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
