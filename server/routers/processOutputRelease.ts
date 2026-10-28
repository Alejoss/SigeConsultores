import { randomUUID } from "crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  processOutputReleaseControls,
  processOutputReleaseEvidence,
  processOutputReleasePeriods,
  subprocessMaps,
} from "../../drizzle/schema";
import { assertProcessAccessById } from "../_core/companyPermissions";
import { companyProcedure, router } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";
import { storageDelete, storageGet } from "../storage";

const verificationMethods = [
  "revision_documental",
  "muestreo",
  "revision_datos",
  "confirmacion_cliente",
  "otra",
] as const;
const frequencies = [
  "por_evento",
  "diaria",
  "semanal",
  "mensual",
  "trimestral",
  "anual",
  "otra",
] as const;
const periodStatuses = ["pending", "released", "exception"] as const;

type SourceOutput = {
  id?: number | string;
  sourceOutputKey?: string;
  salidas?: string;
  entregables?: string;
  doc?: string;
};

type ControlRow = typeof processOutputReleaseControls.$inferSelect;
type PeriodRow = typeof processOutputReleasePeriods.$inferSelect;

function actorAccountId(ctx: TrpcContext): number | null {
  return ctx.user?.id ?? ctx.processLeader?.processLeaderId ?? null;
}

function dateOnly(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function parseDate(value: string): Date {
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "La fecha indicada no es válida." });
  }
  return parsed;
}

function normalizeOutputKey(output: SourceOutput, index: number): string {
  const persisted = output.sourceOutputKey?.trim();
  if (persisted) return persisted;
  return `legacy:${output.id ?? index + 1}`;
}

function parseMapOutputs(raw: string | null): SourceOutput[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(row => row && typeof row === "object") : [];
  } catch {
    return [];
  }
}

function periodKeyForDate(scheduledDate: string): string {
  return `scheduled:${scheduledDate}`;
}

function advanceScheduledDate(value: Date, frequency: (typeof frequencies)[number]): Date | null {
  const next = new Date(value);
  if (frequency === "diaria") next.setUTCDate(next.getUTCDate() + 1);
  else if (frequency === "semanal") next.setUTCDate(next.getUTCDate() + 7);
  else if (frequency === "mensual") next.setUTCMonth(next.getUTCMonth() + 1);
  else if (frequency === "trimestral") next.setUTCMonth(next.getUTCMonth() + 3);
  else if (frequency === "anual") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else return null;
  return next;
}

function nextFutureScheduledDate(
  scheduledDate: Date,
  frequency: (typeof frequencies)[number]
): Date | null {
  let next = advanceScheduledDate(scheduledDate, frequency);
  if (!next) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  while (next.getTime() <= today.getTime()) {
    const advanced = advanceScheduledDate(next, frequency);
    if (!advanced) return null;
    next = advanced;
  }
  return next;
}

function statusForSummary(
  controls: ControlRow[],
  periods: PeriodRow[]
): {
  value: number | null;
  status: "no_controls" | "pending_evaluation" | "measured";
  scheduledControls: number;
  assessableControls: number;
  releasedOnTime: number;
  exceptions: number;
  overdueOpen: number;
} {
  const activeControls = controls.filter(control => control.isActive && !control.archivedAt);
  if (activeControls.length === 0) {
    return {
      value: null,
      status: "no_controls",
      scheduledControls: 0,
      assessableControls: 0,
      releasedOnTime: 0,
      exceptions: 0,
      overdueOpen: 0,
    };
  }

  const activeIds = new Set(activeControls.map(control => control.id));
  const activePeriods = periods.filter(period => activeIds.has(period.controlId));
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const assessable = activePeriods.filter(period => new Date(period.scheduledDate).getTime() <= today.getTime());
  const releasedOnTime = assessable.filter(period => {
    if (period.status !== "released" || !period.releasedAt) return false;
    const dueAt = new Date(period.scheduledDate);
    dueAt.setHours(23, 59, 59, 999);
    return new Date(period.releasedAt).getTime() <= dueAt.getTime();
  }).length;
  const exceptions = assessable.filter(period => period.status === "exception").length;
  const overdueOpen = assessable.filter(period => period.status === "pending").length;

  if (assessable.length === 0) {
    return {
      value: null,
      status: "pending_evaluation",
      scheduledControls: activeControls.length,
      assessableControls: 0,
      releasedOnTime: 0,
      exceptions: 0,
      overdueOpen: 0,
    };
  }

  return {
    value: Math.round((releasedOnTime / assessable.length) * 100),
    status: "measured",
    scheduledControls: activeControls.length,
    assessableControls: assessable.length,
    releasedOnTime,
    exceptions,
    overdueOpen,
  };
}

async function getMapSourceOutput(
  processId: number,
  sourceOutputKey: string
): Promise<SourceOutput | null> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
  const [map] = await db
    .select({ salida: subprocessMaps.salida })
    .from(subprocessMaps)
    .where(eq(subprocessMaps.processId, processId))
    .limit(1);
  return (
    parseMapOutputs(map?.salida ?? null).find(
      (output, index) => normalizeOutputKey(output, index) === sourceOutputKey
    ) ?? null
  );
}

async function getProcessControlData(processId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });

  const controls = await db
    .select()
    .from(processOutputReleaseControls)
    .where(eq(processOutputReleaseControls.processId, processId))
    .orderBy(asc(processOutputReleaseControls.createdAt));
  const controlIds = controls.map(control => control.id);
  const periods = controlIds.length
    ? await db
        .select()
        .from(processOutputReleasePeriods)
        .where(inArray(processOutputReleasePeriods.controlId, controlIds))
        .orderBy(asc(processOutputReleasePeriods.scheduledDate))
    : [];
  const periodIds = periods.map(period => period.id);
  const evidence = periodIds.length
    ? await db
        .select()
        .from(processOutputReleaseEvidence)
        .where(inArray(processOutputReleaseEvidence.periodId, periodIds))
    : [];

  const [map] = await db
    .select({ salida: subprocessMaps.salida, subprocesos: subprocessMaps.subprocesos })
    .from(subprocessMaps)
    .where(eq(subprocessMaps.processId, processId))
    .limit(1);
  const outputs = parseMapOutputs(map?.salida ?? null);
  const outputByKey = new Map(
    outputs.map((output, index) => [normalizeOutputKey(output, index), output])
  );
  const evidenceCountByPeriod = new Map<number, number>();
  for (const row of evidence) {
    evidenceCountByPeriod.set(row.periodId, (evidenceCountByPeriod.get(row.periodId) ?? 0) + 1);
  }

  return {
    controls: controls.map(control => {
      const liveOutput = outputByKey.get(control.sourceOutputKey);
      return {
        ...control,
        output: liveOutput?.salidas ?? control.outputSnapshot,
        deliverable: liveOutput?.entregables ?? control.deliverableSnapshot,
        documentation: liveOutput?.doc ?? control.documentationSnapshot,
        sourceStillInMap: Boolean(liveOutput),
        periods: periods
          .filter(period => period.controlId === control.id)
          .map(period => ({
            ...period,
            evidenceCount: evidenceCountByPeriod.get(period.id) ?? 0,
          })),
      };
    }),
    periods,
  };
}

async function findControl(controlId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
  const [control] = await db
    .select()
    .from(processOutputReleaseControls)
    .where(eq(processOutputReleaseControls.id, controlId))
    .limit(1);
  if (!control) throw new TRPCError({ code: "NOT_FOUND", message: "Control de salida no encontrado." });
  return control;
}

async function findPeriod(periodId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
  const [period] = await db
    .select()
    .from(processOutputReleasePeriods)
    .where(eq(processOutputReleasePeriods.id, periodId))
    .limit(1);
  if (!period) throw new TRPCError({ code: "NOT_FOUND", message: "Liberación programada no encontrada." });
  return period;
}

const controlInput = z.object({
  processId: z.number().int().positive(),
  sourceOutputKey: z.string().trim().min(1).max(128),
  sourceSubprocessName: z.string().trim().max(2000).optional(),
  acceptanceCriteria: z.string().trim().max(10000).optional(),
  verificationMethod: z.enum(verificationMethods).nullable().optional(),
  verificationDetail: z.string().trim().max(5000).optional(),
  frequency: z.enum(frequencies),
  frequencyDetail: z.string().trim().max(1000).optional(),
  isActive: z.boolean(),
  initialScheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expectedRevision: z.number().int().positive().optional(),
});

export const processOutputReleaseRouter = router({
  list: companyProcedure
    .input(z.object({ processId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertProcessAccessById(ctx, input.processId);
      const data = await getProcessControlData(input.processId);
      return {
        controls: data.controls,
        summary: statusForSummary(
          data.controls as ControlRow[],
          data.periods as PeriodRow[]
        ),
      };
    }),

  upsert: companyProcedure.input(controlInput).mutation(async ({ input, ctx }) => {
    await assertProcessAccessById(ctx, input.processId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });

    const source = await getMapSourceOutput(input.processId, input.sourceOutputKey);
    const [existing] = await db
      .select()
      .from(processOutputReleaseControls)
      .where(
        and(
          eq(processOutputReleaseControls.processId, input.processId),
          eq(processOutputReleaseControls.sourceOutputKey, input.sourceOutputKey)
        )
      )
      .limit(1);

    if (!existing && !source) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "La salida seleccionada ya no existe en el Mapa de Subprocesos.",
      });
    }
    if (existing && input.expectedRevision && input.expectedRevision !== existing.revision) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Este control fue actualizado en otra sesión. Actualice la página antes de continuar.",
      });
    }
    if (input.isActive && (!input.acceptanceCriteria || !input.verificationMethod)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Para activar el control indique criterios de aceptación y método de verificación.",
      });
    }

    const values = {
      sourceSubprocessName: input.sourceSubprocessName || null,
      acceptanceCriteria: input.acceptanceCriteria || null,
      verificationMethod: input.verificationMethod || null,
      verificationDetail: input.verificationDetail || null,
      frequency: input.frequency,
      frequencyDetail: input.frequencyDetail || null,
      isActive: input.isActive,
      configuredByAccountId: actorAccountId(ctx),
      revision: (existing?.revision ?? 0) + 1,
      archivedAt: null,
      updatedAt: new Date(),
    } as const;

    let controlId: number;
    if (existing) {
      await db
        .update(processOutputReleaseControls)
        .set(values)
        .where(eq(processOutputReleaseControls.id, existing.id));
      controlId = existing.id;
    } else {
      const created = await db.insert(processOutputReleaseControls).values({
        processId: input.processId,
        sourceOutputKey: input.sourceOutputKey,
        sourceSubprocessName: values.sourceSubprocessName,
        outputSnapshot: source?.salidas?.trim() || "Salida sin nombre",
        deliverableSnapshot: source?.entregables?.trim() || "Sin entregable definido",
        documentationSnapshot: source?.doc?.trim() || null,
        acceptanceCriteria: values.acceptanceCriteria,
        verificationMethod: values.verificationMethod,
        verificationDetail: values.verificationDetail,
        frequency: values.frequency,
        frequencyDetail: values.frequencyDetail,
        isActive: values.isActive,
        configuredByAccountId: values.configuredByAccountId,
        revision: values.revision,
      });
      controlId = Number(created[0].insertId);
    }

    if (input.isActive && input.initialScheduledDate) {
      const key = periodKeyForDate(input.initialScheduledDate);
      const existingPeriods = await db
        .select({ id: processOutputReleasePeriods.id })
        .from(processOutputReleasePeriods)
        .where(
          and(
            eq(processOutputReleasePeriods.controlId, controlId),
            eq(processOutputReleasePeriods.periodKey, key)
          )
        )
        .limit(1);
      if (!existingPeriods.length) {
        await db.insert(processOutputReleasePeriods).values({
          controlId,
          processId: input.processId,
          periodKey: key,
          scheduledDate: parseDate(input.initialScheduledDate),
        });
      }
    }

    return { id: controlId, revision: values.revision };
  }),

  archive: companyProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const control = await findControl(input.id);
      await assertProcessAccessById(ctx, control.processId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
      await db
        .update(processOutputReleaseControls)
        .set({ isActive: false, archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(processOutputReleaseControls.id, input.id));
      return { success: true };
    }),

  updatePeriod: companyProcedure
    .input(
      z.object({
        periodId: z.number().int().positive(),
        status: z.enum(periodStatuses),
        observations: z.string().trim().max(10000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const period = await findPeriod(input.periodId);
      await assertProcessAccessById(ctx, period.processId);
      const control = await findControl(period.controlId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });

      const isReleased = input.status === "released";
      await db
        .update(processOutputReleasePeriods)
        .set({
          status: input.status,
          observations: input.observations || null,
          releasedAt: isReleased ? new Date() : null,
          releasedByAccountId: isReleased ? actorAccountId(ctx) : null,
          updatedAt: new Date(),
        })
        .where(eq(processOutputReleasePeriods.id, period.id));

      // Una liberación periódica genera sólo el siguiente periodo futuro. La
      // restricción única evita duplicados ante doble clic o reintento.
      if (isReleased && control.isActive && !control.archivedAt) {
        const nextDate = nextFutureScheduledDate(
          new Date(period.scheduledDate),
          control.frequency as (typeof frequencies)[number]
        );
        if (nextDate) {
          const nextDateText = dateOnly(nextDate);
          const nextKey = periodKeyForDate(nextDateText);
          const existing = await db
            .select({ id: processOutputReleasePeriods.id })
            .from(processOutputReleasePeriods)
            .where(
              and(
                eq(processOutputReleasePeriods.controlId, control.id),
                eq(processOutputReleasePeriods.periodKey, nextKey)
              )
            )
            .limit(1);
          if (!existing.length) {
            await db.insert(processOutputReleasePeriods).values({
              controlId: control.id,
              processId: period.processId,
              periodKey: nextKey,
              scheduledDate: nextDate,
            });
          }
        }
      }
      return { success: true };
    }),

  listEvidence: companyProcedure
    .input(z.object({ periodId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const period = await findPeriod(input.periodId);
      await assertProcessAccessById(ctx, period.processId);
      const db = await getDb();
      if (!db) return [];
      const evidence = await db
        .select()
        .from(processOutputReleaseEvidence)
        .where(eq(processOutputReleaseEvidence.periodId, period.id));
      return Promise.all(
        evidence.map(async row => {
          try {
            const { url } = await storageGet(row.fileKey);
            return { ...row, fileUrl: url };
          } catch {
            return row;
          }
        })
      );
    }),

  deleteEvidence: companyProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
      const [evidence] = await db
        .select({ id: processOutputReleaseEvidence.id, periodId: processOutputReleaseEvidence.periodId, fileKey: processOutputReleaseEvidence.fileKey })
        .from(processOutputReleaseEvidence)
        .where(eq(processOutputReleaseEvidence.id, input.id))
        .limit(1);
      if (!evidence) throw new TRPCError({ code: "NOT_FOUND", message: "Evidencia no encontrada." });
      const period = await findPeriod(evidence.periodId);
      await assertProcessAccessById(ctx, period.processId);
      try {
        await storageDelete(evidence.fileKey);
      } catch {
        // La referencia se retira aunque el objeto ya no exista en almacenamiento.
      }
      await db.delete(processOutputReleaseEvidence).where(eq(processOutputReleaseEvidence.id, evidence.id));
      return { success: true };
    }),
});

export { parseMapOutputs, normalizeOutputKey, statusForSummary, periodKeyForDate };
