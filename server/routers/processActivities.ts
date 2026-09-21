import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { processCompliances, processes } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  asActivityView,
  calculateActivityProgress,
  dateAtNoon,
  getActivityOccurrences,
  getCompletedOccurrenceDates,
} from "../lib/processActivities";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().regex(DATE_RE, "Use una fecha válida.");
const optionalDateSchema = z.union([dateSchema, z.literal(""), z.null()]).optional();
const scheduleTypeSchema = z.enum(["once", "weekly", "monthly"]);
const trackingTypeSchema = z.enum([
  "puntual",
  "mensual_sumatoria",
  "mensual_promedio",
  "mensual_checklist",
]);
const monthlyNumbersSchema = z.array(z.number().finite()).length(12);
const monthlyChecklistSchema = z.array(z.boolean()).length(12);

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type ActivityInput = z.infer<typeof activityInputSchema>;

function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

function unavailable(): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Base de datos no disponible.",
  });
}

async function getProcessOrThrow(db: Database, processId: number) {
  const [process] = await db
    .select({ id: processes.id, companyId: processes.companyId, name: processes.name })
    .from(processes)
    .where(eq(processes.id, processId))
    .limit(1);
  if (!process) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Proceso no encontrado." });
  }
  return process;
}

function assertProcessAccess(ctx: TrpcContext, process: { id: number; companyId: number }) {
  if (ctx.user?.role === "admin") return;
  if (ctx.manager?.companyId === process.companyId) return;
  if (
    ctx.processLeader?.companyId === process.companyId &&
    ctx.processLeader.processId === process.id
  ) {
    return;
  }
  forbidden("No tiene acceso a las actividades de este proceso.");
}

function optionalDate(value: string | null | undefined): Date | null {
  return value && DATE_RE.test(value) ? dateAtNoon(value) : null;
}

function validateSchedule(input: ActivityInput) {
  const start = input.scheduleType === "once" ? input.dueDate : input.scheduleStartDate;
  const end = input.scheduleType === "once" ? input.dueDate : input.scheduleEndDate;
  if (!start || !DATE_RE.test(start)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Defina la fecha de la actividad o la fecha inicial de la programación.",
    });
  }
  if (input.scheduleType !== "once") {
    if (!end || !DATE_RE.test(end)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Las actividades semanales y mensuales requieren una fecha final.",
      });
    }
    const startDate = dateAtNoon(start);
    const endDate = dateAtNoon(end);
    if (endDate < startDate) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "La fecha final debe ser posterior a la fecha inicial.",
      });
    }
    const years = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (years > 3) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "La programación recurrente puede abarcar hasta tres años.",
      });
    }
  }
}

function buildStoredActivity(input: ActivityInput) {
  validateSchedule(input);
  const provisional = {
    trackingType: input.trackingType,
    trackingStartValue: input.trackingStartValue,
    trackingTargetValue: input.trackingTargetValue,
    trackingCurrentValue: input.trackingCurrentValue,
    monthlyTrackingValues: JSON.stringify(input.monthlyTrackingValues),
    monthlyChecklistValues: JSON.stringify(input.monthlyChecklistValues),
    completionPercentage: 0,
  };
  const progress = calculateActivityProgress(provisional);
  const scheduleStartDate =
    input.scheduleType === "once" ? input.dueDate : input.scheduleStartDate;

  return {
    requirement: input.requirement.trim(),
    description: input.description?.trim() || null,
    // La columna es histórica y NOT NULL. La interfaz ya no expone esta
    // clasificación; se conserva sin eliminar ningún dato anterior.
    obligationType: "Otros" as const,
    otherObligationType: "Actividad",
    responsible: input.responsible?.trim() || null,
    dueDate: optionalDate(scheduleStartDate),
    observations: input.observations?.trim() || null,
    scheduleType: input.scheduleType,
    scheduleStartDate: optionalDate(input.scheduleStartDate || input.dueDate),
    scheduleEndDate:
      input.scheduleType === "once" ? null : optionalDate(input.scheduleEndDate),
    scheduleWeekday:
      input.scheduleType === "weekly" ? input.scheduleWeekday ?? null : null,
    scheduleDayOfMonth:
      input.scheduleType === "monthly" ? input.scheduleDayOfMonth ?? null : null,
    trackingType: input.trackingType,
    trackingStartValue: String(input.trackingStartValue),
    trackingTargetValue: String(input.trackingTargetValue),
    trackingCurrentValue: String(input.trackingCurrentValue),
    trackingUnit: input.trackingUnit?.trim() || "%",
    monthlyTrackingValues: JSON.stringify(input.monthlyTrackingValues),
    monthlyChecklistValues: JSON.stringify(input.monthlyChecklistValues),
    completionPercentage: progress,
    completed: progress >= 100 ? ("SI" as const) : ("NO" as const),
  };
}

const activityInputSchema = z.object({
  processId: z.number().int().positive(),
  requirement: z.string().trim().min(1, "Escriba el nombre de la actividad.").max(255),
  description: z.string().max(20_000).optional(),
  responsible: z.string().max(255).optional(),
  observations: z.string().max(20_000).optional(),
  scheduleType: scheduleTypeSchema,
  dueDate: optionalDateSchema,
  scheduleStartDate: optionalDateSchema,
  scheduleEndDate: optionalDateSchema,
  scheduleWeekday: z.number().int().min(0).max(6).nullable().optional(),
  scheduleDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  trackingType: trackingTypeSchema,
  trackingStartValue: z.number().finite(),
  trackingTargetValue: z.number().finite(),
  trackingCurrentValue: z.number().finite(),
  trackingUnit: z.string().max(100).optional(),
  monthlyTrackingValues: monthlyNumbersSchema,
  monthlyChecklistValues: monthlyChecklistSchema,
});

async function getActivityOrThrow(db: Database, activityId: number) {
  const [activity] = await db
    .select()
    .from(processCompliances)
    .where(eq(processCompliances.id, activityId))
    .limit(1);
  if (!activity) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Actividad no encontrada." });
  }
  return activity;
}

export const processActivitiesRouter = router({
  list: companyProcedure
    .input(z.object({ processId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const process = await getProcessOrThrow(db, input.processId);
      assertProcessAccess(ctx, process);
      const activities = await db
        .select()
        .from(processCompliances)
        .where(eq(processCompliances.processId, input.processId))
        .orderBy(asc(processCompliances.createdAt), asc(processCompliances.id));
      return activities.map(activity => asActivityView(activity as Record<string, unknown>));
    }),

  create: companyProcedure
    .input(activityInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) unavailable();
      const process = await getProcessOrThrow(db, input.processId);
      assertProcessAccess(ctx, process);
      const stored = buildStoredActivity(input);
      const result = await db.insert(processCompliances).values({
        processId: process.id,
        ...stored,
      });
      return { success: true, id: Number((result as any)[0]?.insertId ?? 0) };
    }),

  update: companyProcedure
    .input(activityInputSchema.extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) unavailable();
      const activity = await getActivityOrThrow(db, input.id);
      const process = await getProcessOrThrow(db, activity.processId);
      assertProcessAccess(ctx, process);
      if (input.processId !== activity.processId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No se puede cambiar el proceso de una actividad existente.",
        });
      }
      const stored = buildStoredActivity(input);
      await db
        .update(processCompliances)
        .set({ ...stored, updatedAt: new Date() })
        .where(eq(processCompliances.id, activity.id));
      return { success: true };
    }),

  setOccurrenceCompleted: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        occurrenceDate: dateSchema,
        completed: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) unavailable();
      const activity = await getActivityOrThrow(db, input.id);
      const process = await getProcessOrThrow(db, activity.processId);
      assertProcessAccess(ctx, process);

      const occurrences = getActivityOccurrences(activity as Record<string, unknown>);
      if (!occurrences.some(item => item.date === input.occurrenceDate)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "La fecha seleccionada no pertenece a la programación de la actividad.",
        });
      }
      const completedDates = new Set(
        getCompletedOccurrenceDates(activity as Record<string, unknown>)
      );
      if (input.completed) completedDates.add(input.occurrenceDate);
      else completedDates.delete(input.occurrenceDate);

      const isOneTime = activity.scheduleType === "once";
      const targetValue = Number(activity.trackingTargetValue ?? 100);
      const startValue = Number(activity.trackingStartValue ?? 0);

      await db
        .update(processCompliances)
        .set({
          completedOccurrenceDates: JSON.stringify(Array.from(completedDates).sort()),
          trackingCurrentValue: isOneTime
            ? String(input.completed ? targetValue : startValue)
            : activity.trackingCurrentValue,
          completionPercentage: isOneTime
            ? input.completed
              ? 100
              : 0
            : activity.completionPercentage,
          completed: isOneTime ? (input.completed ? "SI" : "NO") : activity.completed,
          updatedAt: new Date(),
        })
        .where(eq(processCompliances.id, activity.id));
      return { success: true };
    }),

  delete: companyProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) unavailable();
      const activity = await getActivityOrThrow(db, input.id);
      const process = await getProcessOrThrow(db, activity.processId);
      assertProcessAccess(ctx, process);
      await db.delete(processCompliances).where(eq(processCompliances.id, activity.id));
      return { success: true };
    }),
});
