import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { processCompliances } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const processCompliancesRouter = router({
  list: protectedProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const result = await db.select().from(processCompliances)
        .where(eq(processCompliances.processId, input.processId));

      return result;
    }),

  create: protectedProcedure
    .input(z.object({
      processId: z.number(),
      requirement: z.string(),
      obligationType: z.enum(["Legal", "Reglamentaria", "Concesion", "Sistema de Gestion", "Otros"]),
      otherObligationType: z.string().optional(),
      dueDate: z.string().optional(),
      responsible: z.string().optional(),
      completed: z.enum(["SI", "NO"]).default("NO"),
      observations: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(processCompliances).values({
        processId: input.processId,
        requirement: input.requirement,
        obligationType: input.obligationType as any,
        otherObligationType: input.otherObligationType || null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        responsible: input.responsible || null,
        completed: input.completed as any,
        observations: input.observations || null,
      });

      return { success: true, message: "Obligación creada exitosamente" };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      requirement: z.string(),
      obligationType: z.enum(["Legal", "Reglamentaria", "Concesion", "Sistema de Gestion", "Otros"]),
      otherObligationType: z.string().optional(),
      dueDate: z.string().optional(),
      responsible: z.string().optional(),
      completed: z.enum(["SI", "NO"]),
      observations: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(processCompliances)
        .set({
          requirement: input.requirement,
          obligationType: input.obligationType,
          otherObligationType: input.otherObligationType || null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          responsible: input.responsible || null,
          completed: input.completed,
          observations: input.observations || null,
          updatedAt: new Date(),
        })
        .where(eq(processCompliances.id, input.id));

      return { success: true, message: "Obligación actualizada exitosamente" };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(processCompliances)
        .where(eq(processCompliances.id, input.id));

      return { success: true, message: "Obligación eliminada exitosamente" };
    }),
});
