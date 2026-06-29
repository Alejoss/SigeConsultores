import z from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { stakeholderSurveys } from "../../drizzle/schema";
import { eq, asc } from "drizzle-orm";

const segmentEnum = z.enum(["Clientes", "Proveedores Externos", "Proveedores Internos", "Mixto"]);

export const stakeholderSurveysRouter = router({
  // Listar todas las encuestas de un proceso
  list: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(stakeholderSurveys)
        .where(eq(stakeholderSurveys.processId, input.processId))
        .orderBy(asc(stakeholderSurveys.orderIndex));
    }),

  // Crear nueva encuesta
  create: companyProcedure
    .input(z.object({
      processId: z.number(),
      surveyName: z.string().default(""),
      segment: segmentEnum.default("Clientes"),
      surveyDate: z.string().optional(),
      sentCount: z.number().optional(),
      respondedCount: z.number().optional(),
      nps: z.number().min(-100).max(100).optional().nullable(),
      csat: z.number().min(0).max(100).optional().nullable(),
      avgRating: z.string().optional(),
      topStrengths: z.string().optional(),
      topWeaknesses: z.string().optional(),
      mainFindings: z.string().optional(),
      linkedActionIds: z.string().optional(),
      orderIndex: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(stakeholderSurveys).values({
        processId: input.processId,
        surveyName: input.surveyName,
        segment: input.segment,
        surveyDate: input.surveyDate || "",
        sentCount: input.sentCount || 0,
        respondedCount: input.respondedCount || 0,
        nps: input.nps ?? null,
        csat: input.csat ?? null,
        avgRating: input.avgRating || "",
        topStrengths: input.topStrengths || null,
        topWeaknesses: input.topWeaknesses || null,
        mainFindings: input.mainFindings || null,
        linkedActionIds: input.linkedActionIds || null,
        orderIndex: input.orderIndex || 0,
      } as any);

      // Devolver el registro recién creado
      const rows = await db
        .select()
        .from(stakeholderSurveys)
        .where(eq(stakeholderSurveys.processId, input.processId))
        .orderBy(asc(stakeholderSurveys.id));
      return rows[rows.length - 1] || null;
    }),

  // Actualizar encuesta existente
  update: companyProcedure
    .input(z.object({
      id: z.number(),
      surveyName: z.string().optional(),
      segment: segmentEnum.optional(),
      surveyDate: z.string().optional(),
      sentCount: z.number().optional(),
      respondedCount: z.number().optional(),
      nps: z.number().min(-100).max(100).optional().nullable(),
      csat: z.number().min(0).max(100).optional().nullable(),
      avgRating: z.string().optional(),
      topStrengths: z.string().optional(),
      topWeaknesses: z.string().optional(),
      mainFindings: z.string().optional(),
      linkedActionIds: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const updateData: any = { updatedAt: new Date() };
      if (input.surveyName !== undefined) updateData.surveyName = input.surveyName;
      if (input.segment !== undefined) updateData.segment = input.segment;
      if (input.surveyDate !== undefined) updateData.surveyDate = input.surveyDate;
      if (input.sentCount !== undefined) updateData.sentCount = input.sentCount;
      if (input.respondedCount !== undefined) updateData.respondedCount = input.respondedCount;
      if (input.nps !== undefined) updateData.nps = input.nps;
      if (input.csat !== undefined) updateData.csat = input.csat;
      if (input.avgRating !== undefined) updateData.avgRating = input.avgRating;
      if (input.topStrengths !== undefined) updateData.topStrengths = input.topStrengths;
      if (input.topWeaknesses !== undefined) updateData.topWeaknesses = input.topWeaknesses;
      if (input.mainFindings !== undefined) updateData.mainFindings = input.mainFindings;
      if (input.linkedActionIds !== undefined) updateData.linkedActionIds = input.linkedActionIds;

      await db.update(stakeholderSurveys).set(updateData).where(eq(stakeholderSurveys.id, input.id));
      return { success: true };
    }),

  // Eliminar encuesta
  delete: companyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(stakeholderSurveys).where(eq(stakeholderSurveys.id, input.id));
      return { success: true };
    }),
});
