import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { companyValues } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const valuesRouter = router({
  create: companyProcedure
    .input(z.object({
      companyId: z.number(),
      name: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get current count to check limit
      const existing = await db.select().from(companyValues)
        .where(eq(companyValues.companyId, input.companyId));

      if (existing.length >= 15) {
        throw new Error("Máximo 15 valores permitidos");
      }

      await db.insert(companyValues).values({
        companyId: input.companyId,
        value: JSON.stringify({ name: input.name, description: input.description || "" }),
        orderIndex: existing.length,
      });

      return { success: true };
    }),

  list: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const values = await db.select().from(companyValues)
        .where(eq(companyValues.companyId, input.companyId));

      return values.map(v => {
        try {
          const parsed = JSON.parse(v.value);
          return {
            id: v.id.toString(),
            ...parsed,
            orderIndex: v.orderIndex,
          };
        } catch {
          return {
            id: v.id.toString(),
            name: v.value,
            description: "",
            orderIndex: v.orderIndex,
          };
        }
      });
    }),

  update: companyProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(companyValues)
        .set({
          value: JSON.stringify({ name: input.name, description: input.description || "" }),
        })
        .where(eq(companyValues.id, input.id));

      return { success: true };
    }),

  delete: companyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(companyValues)
        .where(eq(companyValues.id, input.id));

      return { success: true };
    }),
});
