import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { policyObjectives } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const policyObjectivesRouter = router({
  list: companyProcedure
    .input(z.object({ policyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const objectives = await db.select().from(policyObjectives)
        .where(eq(policyObjectives.policyId, input.policyId));

      return objectives;
    }),

  create: companyProcedure
    .input(z.object({
      policyId: z.number(),
      objective: z.string(),
      description: z.string().optional(),
      orderIndex: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(policyObjectives).values({
        policyId: input.policyId,
        objective: input.objective,
        description: input.description || null,
        orderIndex: input.orderIndex,
      });

      return { success: true };
    }),

  update: companyProcedure
    .input(z.object({
      id: z.number(),
      objective: z.string(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(policyObjectives)
        .set({
          objective: input.objective,
          description: input.description || null,
        })
        .where(eq(policyObjectives.id, input.id));

      return { success: true };
    }),

  delete: companyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(policyObjectives)
        .where(eq(policyObjectives.id, input.id));

      return { success: true };
    }),
});
