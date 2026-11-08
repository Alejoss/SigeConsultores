import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { companyManagementProcedure, companyReadProcedure, companyProcedure, router } from "../_core/trpc";
import { assertCompanyRecordManagementAccess } from "../_core/companyPermissions";
import { getDb } from "../db";
import {
  strategicObjectives,
  strategicObjectiveMeasurementConfigs,
  strategicObjectiveMeasurements,
  type InsertStrategicObjective,
} from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import {
  calculateStrategicObjectiveProgress,
  isStrategicMeasurementConfigured,
  summarizeStrategicObjectiveMeasurements,
  type StrategicMeasurementConfig,
  type StrategicMeasurementDetail,
  type StrategicMeasurementOverview,
} from "../../shared/strategicObjectiveMeasurement";
import {
  getStrategicMeasuredObjectives,
  getStrategicObjectiveMeasurementRows,
  isValidStrategicMeasurementDate,
  strategicMeasurementToday,
  toStrategicMeasuredObjective,
  toStrategicMeasurement,
  toStrategicMeasurementConfig,
  type StrategicMeasurementTransaction,
} from "../lib/strategicObjectiveMeasurementData";

const idSchema = z.number().int().positive();
const draftDeadlineSchema = z.string().refine(
  value => value === "" || isValidStrategicMeasurementDate(value),
  "Ingrese una fecha válida (AAAA-MM-DD).",
);
const measurementConfigSchema = z.object({
  initialSituation: z.string().max(10000),
  expectedResult: z.string().max(10000),
  indicator: z.string().max(10000),
  weight: z.number().finite().nullable(),
  baseline: z.number().finite().nullable(),
  goal: z.number().finite().nullable(),
  unit: z.string().max(255),
  deadline: draftDeadlineSchema,
});
const completeConfigSchema = measurementConfigSchema.refine(
  isStrategicMeasurementConfigured,
  "Complete indicador, unidad, plazo, peso (mayor a 0 y hasta 100), línea base y meta distinta a la línea base.",
);

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
  return db;
}

/** Every mutation for an existing OE serializes on the same parent row. */
async function lockObjective(tx: StrategicMeasurementTransaction, objectiveId: number, companyId?: number) {
  const [objective] = await tx.select().from(strategicObjectives)
    .where(companyId === undefined
      ? eq(strategicObjectives.id, objectiveId)
      : and(eq(strategicObjectives.id, objectiveId), eq(strategicObjectives.companyId, companyId)))
    .limit(1).for("update");
  if (!objective) throw new TRPCError({ code: "NOT_FOUND", message: "Objetivo estratégico no encontrado en esta empresa." });
  return objective;
}

async function saveConfig(
  tx: StrategicMeasurementTransaction,
  companyId: number,
  objectiveId: number,
  config: StrategicMeasurementConfig,
) {
  // No legacy name/target/deadline/year/OTE column is written here.
  await tx.insert(strategicObjectiveMeasurementConfigs)
    .values({ companyId, objectiveId, ...config })
    .onDuplicateKeyUpdate({ set: { ...config } });
}

export const strategicObjectivesRouter = router({
  create: companyManagementProcedure
    .input(z.object({
      companyId: idSchema,
      name: z.string(),
      description: z.string().optional(),
      target: z.string().optional(),
      responsible: z.string().optional(),
      deadline: draftDeadlineSchema.optional(),
      orderIndex: z.number(),
      // Legacy clients can still create without any measurement configuration.
      measurementConfig: completeConfigSchema.optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      return db.transaction(async tx => {
        const startYear = input.deadline ? new Date(input.deadline).getFullYear() : new Date().getFullYear();
        const [created] = await tx.insert(strategicObjectives).values({
          companyId: input.companyId,
          objective: input.name,
          description: input.description || null,
          target: input.target || null,
          startYear,
          endYear: startYear + 1,
          generalManagerName: input.responsible || null,
          orderIndex: input.orderIndex,
        }).$returningId();
        // The insert already locks the new row; use the common lock explicitly.
        await lockObjective(tx, created.id, input.companyId);
        if (input.measurementConfig) await saveConfig(tx, input.companyId, created.id, input.measurementConfig);
        return { success: true, objectiveId: created.id };
      });
    }),

  list: companyReadProcedure
    .input(z.object({ companyId: idSchema }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return getStrategicMeasuredObjectives(db, input.companyId);
    }),

  update: companyProcedure
    .input(z.object({
      id: idSchema,
      companyId: idSchema.optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      target: z.string().optional(),
      responsible: z.string().optional(),
      deadline: draftDeadlineSchema.optional(),
      measurementConfig: measurementConfigSchema.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyRecordManagementAccess(ctx, "strategicObjective", input.id);
      const db = await requireDb();
      return db.transaction(async tx => {
        const objective = await lockObjective(tx, input.id, input.companyId);
        const patch: Partial<InsertStrategicObjective> = {};
        if (input.name !== undefined) patch.objective = input.name;
        if (input.description !== undefined) patch.description = input.description || null;
        if (input.target !== undefined) patch.target = input.target || null;
        if (input.responsible !== undefined) patch.generalManagerName = input.responsible || null;
        if (input.deadline !== undefined) {
          patch.startYear = input.deadline ? new Date(input.deadline).getFullYear() : new Date().getFullYear();
          patch.endYear = patch.startYear + 1;
        }
        if (Object.keys(patch).length) {
          await tx.update(strategicObjectives).set(patch)
            .where(and(eq(strategicObjectives.id, input.id), eq(strategicObjectives.companyId, objective.companyId)));
        }
        if (input.measurementConfig) await saveConfig(tx, objective.companyId, input.id, input.measurementConfig);
        return { success: true };
      });
    }),

  saveMeasurementConfig: companyManagementProcedure
    .input(z.object({ companyId: idSchema, objectiveId: idSchema, config: measurementConfigSchema }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      return db.transaction(async tx => {
        await lockObjective(tx, input.objectiveId, input.companyId);
        // Draft values remain null, never replaced with a fabricated numeric zero.
        await saveConfig(tx, input.companyId, input.objectiveId, input.config);
        return { success: true };
      });
    }),

  saveMeasurement: companyManagementProcedure
    .input(z.object({
      companyId: idSchema,
      objectiveId: idSchema,
      measurementDate: z.string().refine(isValidStrategicMeasurementDate, "Ingrese una fecha válida (AAAA-MM-DD).")
        .refine(value => value <= strategicMeasurementToday(), "La fecha de medición no puede ser futura."),
      value: z.number().finite(),
      observation: z.string().max(10000).optional(),
      // Plain evidence reference text. This endpoint never executes/fetches links.
      evidence: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      return db.transaction(async tx => {
        const objective = await lockObjective(tx, input.objectiveId, input.companyId);
        const [configRow] = await tx.select().from(strategicObjectiveMeasurementConfigs)
          .where(and(eq(strategicObjectiveMeasurementConfigs.companyId, input.companyId), eq(strategicObjectiveMeasurementConfigs.objectiveId, input.objectiveId)))
          .limit(1);
        const config = configRow ? toStrategicMeasurementConfig(configRow) : null;
        const percent = calculateStrategicObjectiveProgress(config, input.value);
        if (percent === null || !config || !isValidStrategicMeasurementDate(config.deadline)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Complete la configuración del objetivo antes de registrar una medición." });
        }
        const definitionSnapshot = JSON.stringify({
          name: objective.objective,
          description: objective.description,
          target: objective.target,
          responsible: objective.generalManagerName,
          config,
        });
        await tx.insert(strategicObjectiveMeasurements).values({
          companyId: input.companyId,
          objectiveId: input.objectiveId,
          measurementDate: input.measurementDate,
          value: input.value,
          observation: input.observation ?? "",
          evidence: input.evidence ?? "",
          percent,
          definitionSnapshot,
        }).onDuplicateKeyUpdate({ set: {
          value: input.value,
          ...(input.observation !== undefined ? { observation: input.observation } : {}),
          ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
          percent,
          definitionSnapshot,
        } });
        const [saved] = await tx.select().from(strategicObjectiveMeasurements)
          .where(and(eq(strategicObjectiveMeasurements.companyId, input.companyId), eq(strategicObjectiveMeasurements.objectiveId, input.objectiveId), eq(strategicObjectiveMeasurements.measurementDate, input.measurementDate)))
          .limit(1);
        return { success: true, measurement: toStrategicMeasurement(saved) };
      });
    }),

  getMeasurementOverview: companyReadProcedure
    .input(z.object({ companyId: idSchema }))
    .query(async ({ input }): Promise<StrategicMeasurementOverview> => {
      const db = await requireDb();
      return summarizeStrategicObjectiveMeasurements(await getStrategicMeasuredObjectives(db, input.companyId));
    }),

  getMeasurementDetail: companyReadProcedure
    .input(z.object({ companyId: idSchema, objectiveId: idSchema }))
    .query(async ({ input }): Promise<StrategicMeasurementDetail> => {
      const db = await requireDb();
      const [objective] = await db.select().from(strategicObjectives)
        .where(and(eq(strategicObjectives.companyId, input.companyId), eq(strategicObjectives.id, input.objectiveId)))
        .limit(1);
      if (!objective) throw new TRPCError({ code: "NOT_FOUND", message: "Objetivo estratégico no encontrado en esta empresa." });
      const [configRow] = await db.select().from(strategicObjectiveMeasurementConfigs)
        .where(and(eq(strategicObjectiveMeasurementConfigs.companyId, input.companyId), eq(strategicObjectiveMeasurementConfigs.objectiveId, input.objectiveId)))
        .limit(1);
      const measurements = await getStrategicObjectiveMeasurementRows(db, input.companyId, input.objectiveId);
      return {
        objective: toStrategicMeasuredObjective(objective, configRow ? toStrategicMeasurementConfig(configRow) : null, measurements[0] ?? null),
        measurements,
      };
    }),

  delete: companyProcedure
    .input(z.object({ objectiveId: idSchema }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyRecordManagementAccess(ctx, "strategicObjective", input.objectiveId);
      const db = await requireDb();
      return db.transaction(async tx => {
        await lockObjective(tx, input.objectiveId);
        await tx.delete(strategicObjectiveMeasurements).where(eq(strategicObjectiveMeasurements.objectiveId, input.objectiveId));
        await tx.delete(strategicObjectiveMeasurementConfigs).where(eq(strategicObjectiveMeasurementConfigs.objectiveId, input.objectiveId));
        await tx.delete(strategicObjectives).where(eq(strategicObjectives.id, input.objectiveId));
        return { success: true };
      });
    }),
});
