import { z } from "zod";
import { getDb } from "../db";
import { companyCompliances } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { companyProcedure, router } from "../_core/trpc";

export const companyCompliancesRouter = router({
  list: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return await db
        .select()
        .from(companyCompliances)
        .where(eq(companyCompliances.companyId, input.companyId));
    }),

  create: companyProcedure
    .input(
      z.object({
        companyId: z.number(),
        requirement: z.string().min(1),
        description: z.string().optional(),
        obligationType: z.enum(["Legal", "Reglamentaria", "Concesion", "Sistema de Gestion", "Otros"]),
        otherObligationType: z.string().optional(),
        responsible: z.string().optional(),
        plannedMonths: z.string().optional(),
        completedMonths: z.string().optional(),
        observations: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      await db.insert(companyCompliances).values({
        companyId: input.companyId,
        requirement: input.requirement,
        description: input.description ?? null,
        obligationType: input.obligationType,
        otherObligationType: input.otherObligationType ?? null,
        responsible: input.responsible ?? null,
        completed: "NO",
        plannedMonths: input.plannedMonths ?? null,
        completedMonths: input.completedMonths ?? null,
        observations: input.observations ?? null,
      });
      return { success: true };
    }),

  update: companyProcedure
    .input(
      z.object({
        id: z.number(),
        requirement: z.string().min(1).optional(),
        description: z.string().optional(),
        obligationType: z.enum(["Legal", "Reglamentaria", "Concesion", "Sistema de Gestion", "Otros"]).optional(),
        otherObligationType: z.string().optional(),
        responsible: z.string().optional(),
        completed: z.enum(["SI", "NO"]).optional(),
        plannedMonths: z.string().optional(),
        completedMonths: z.string().optional(),
        observations: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      const { id, ...rest } = input;
      await db
        .update(companyCompliances)
        .set({ ...rest, updatedAt: new Date() })
        .where(eq(companyCompliances.id, id));
      return { success: true };
    }),

  delete: companyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      await db
        .delete(companyCompliances)
        .where(eq(companyCompliances.id, input.id));
      return { success: true };
    }),
});
