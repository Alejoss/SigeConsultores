import { z } from "zod";
import { protectedProcedure, router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { processRiskMatrices } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const processRiskMatrixRouter = router({
  list: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const result = await db.select().from(processRiskMatrices)
        .where(eq(processRiskMatrices.processId, input.processId));

      return result;
    }),

  create: companyProcedure
    .input(z.object({
      processId: z.number(),
      description: z.string(),
      probability: z.number().optional(),
      impact: z.number().optional(),
      riskLevel: z.number().optional(),
      mitigation: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(processRiskMatrices).values({
        processId: input.processId,
        description: input.description,
        probability: input.probability || null,
        impact: input.impact || null,
        riskLevel: input.riskLevel || null,
        mitigation: input.mitigation || null,
      });

      return { success: true, message: "Riesgo creado exitosamente" };
    }),

  update: companyProcedure
    .input(z.object({
      riskId: z.number(),
      description: z.string(),
      probability: z.number().optional(),
      impact: z.number().optional(),
      riskLevel: z.number().optional(),
      mitigation: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(processRiskMatrices)
        .set({
          description: input.description,
          probability: input.probability || null,
          impact: input.impact || null,
          riskLevel: input.riskLevel || null,
          mitigation: input.mitigation || null,
          updatedAt: new Date(),
        })
        .where(eq(processRiskMatrices.id, input.riskId));

      return { success: true, message: "Riesgo actualizado exitosamente" };
    }),

  delete: companyProcedure
    .input(z.object({ riskId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(processRiskMatrices)
        .where(eq(processRiskMatrices.id, input.riskId));

      return { success: true, message: "Riesgo eliminado exitosamente" };
    }),
});
