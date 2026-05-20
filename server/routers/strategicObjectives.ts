import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { strategicObjectives } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const strategicObjectivesRouter = router({
  create: companyProcedure
    .input(z.object({
      companyId: z.number(),
      name: z.string(),
      description: z.string().optional(),
      target: z.string().optional(),
      responsible: z.string().optional(),
      deadline: z.string().optional(),
      orderIndex: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const startYear = input.deadline ? new Date(input.deadline).getFullYear() : new Date().getFullYear();
      const endYear = startYear + 1;

      await db.insert(strategicObjectives).values({
        companyId: input.companyId,
        objective: input.name,
        description: input.description || null,
        target: input.target || null,
        startYear,
        endYear,
        generalManagerName: input.responsible || null,
        orderIndex: input.orderIndex,
      });

      return { success: true };
    }),

  list: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const objectives = await db.select().from(strategicObjectives)
        .where(eq(strategicObjectives.companyId, input.companyId));

      return objectives.map(obj => ({
        id: obj.id,
        objective: obj.objective,
        name: obj.objective,
        description: obj.description || "",
        target: obj.target || "",
        responsible: obj.generalManagerName || "",
        deadline: new Date(obj.startYear, 0, 1).toISOString().split('T')[0],
        orderIndex: obj.orderIndex,
      }));
    }),

  update: companyProcedure
    .input(z.object({
      id: z.number(),
      name: z.string(),
      description: z.string().optional(),
      target: z.string().optional(),
      responsible: z.string().optional(),
      deadline: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const startYear = input.deadline ? new Date(input.deadline).getFullYear() : new Date().getFullYear();
      const endYear = startYear + 1;

      await db.update(strategicObjectives)
        .set({
          objective: input.name,
          description: input.description || null,
          target: input.target || null,
          startYear,
          endYear,
          generalManagerName: input.responsible || null,
        })
        .where(eq(strategicObjectives.id, input.id));

      return { success: true };
    }),

  delete: companyProcedure
    .input(z.object({ objectiveId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(strategicObjectives)
        .where(eq(strategicObjectives.id, input.objectiveId));

      return { success: true };
    }),
});
