import { z } from "zod";
import { protectedProcedure, router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { processFODA } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const processFODARouter = router({
  get: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const result = await db.select().from(processFODA)
        .where(eq(processFODA.processId, input.processId));

      return result.length > 0 ? result[0] : null;
    }),

  upsert: companyProcedure
    .input(z.object({
      processId: z.number(),
      strengths: z.string().optional(),
      opportunities: z.string().optional(),
      weaknesses: z.string().optional(),
      threats: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const existing = await db.select().from(processFODA)
        .where(eq(processFODA.processId, input.processId));

      if (existing.length > 0) {
        await db.update(processFODA)
          .set({
            strengths: input.strengths || null,
            opportunities: input.opportunities || null,
            weaknesses: input.weaknesses || null,
            threats: input.threats || null,
            updatedAt: new Date(),
          })
          .where(eq(processFODA.processId, input.processId));
      } else {
        await db.insert(processFODA).values({
          processId: input.processId,
          strengths: input.strengths || null,
          opportunities: input.opportunities || null,
          weaknesses: input.weaknesses || null,
          threats: input.threats || null,
        });
      }

      return { success: true, message: "FODA guardado exitosamente" };
    }),

  saveMatrixData: companyProcedure
    .input(z.object({
      processId: z.number(),
      matrixData: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const existing = await db.select().from(processFODA)
        .where(eq(processFODA.processId, input.processId));

      if (existing.length > 0) {
        await db.update(processFODA)
          .set({
            matrixData: input.matrixData,
            updatedAt: new Date(),
          })
          .where(eq(processFODA.processId, input.processId));
      } else {
        await db.insert(processFODA).values({
          processId: input.processId,
          matrixData: input.matrixData,
          strengths: null,
          opportunities: null,
          weaknesses: null,
          threats: null,
        });
      }

      return { success: true, message: "Matriz guardada exitosamente" };
    }),
});
