import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { processes } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const processesRouter = router({
  listAll: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];

      const procs = await db.select().from(processes);

      return procs.map(p => ({
        id: p.id,
        name: p.name,
        processType: p.processType,
        description: p.description,
      }));
    }),

  create: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      name: z.string().min(1),
      processType: z.enum(["estrategico", "misional", "soporte"]),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(processes).values({
        companyId: input.companyId,
        name: input.name,
        processType: input.processType,
        description: input.description || null,
      });

      return { success: true };
    }),

  list: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const procs = await db.select().from(processes)
        .where(eq(processes.companyId, input.companyId));

      return procs.map(p => ({
        id: p.id,
        name: p.name,
        processType: p.processType,
        description: p.description,
      }));
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1),
      processType: z.enum(["estrategico", "misional", "soporte"]),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(processes)
        .set({
          name: input.name,
          processType: input.processType,
          description: input.description || null,
        })
        .where(eq(processes.id, input.id));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(processes)
        .where(eq(processes.id, input.id));

      return { success: true };
    }),
});
