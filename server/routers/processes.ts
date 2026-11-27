import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, companyPersonnelManagementProcedure, companyProcedure, companyReadProcedure, router } from "../_core/trpc";
import { assertCompanyPersonnelManagementAccess, assertProcessAccess } from "../_core/companyPermissions";
import { getDb } from "../db";
import { processes } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const processesRouter = router({
  listAll: adminProcedure
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

  create: companyPersonnelManagementProcedure
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

  list: companyReadProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db.select().from(processes).where(eq(processes.companyId, input.companyId));
      const procs = rows.filter(process => {
        try {
          assertProcessAccess(ctx, process);
          return true;
        } catch (error) {
          if (error instanceof TRPCError && error.code === "FORBIDDEN") return false;
          throw error;
        }
      });

      return procs.map(p => ({
        id: p.id,
        name: p.name,
        processType: p.processType,
        description: p.description,
      }));
    }),

  update: companyProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1),
      processType: z.enum(["estrategico", "misional", "soporte"]),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [current] = await db.select({ companyId: processes.companyId }).from(processes).where(eq(processes.id, input.id)).limit(1);
      if (!current) throw new Error("Proceso no encontrado");
      assertCompanyPersonnelManagementAccess(ctx, current.companyId);

      await db.update(processes)
        .set({
          name: input.name,
          processType: input.processType,
          description: input.description || null,
        })
        .where(eq(processes.id, input.id));

      return { success: true };
    }),

  delete: companyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [current] = await db.select({ companyId: processes.companyId }).from(processes).where(eq(processes.id, input.id)).limit(1);
      if (!current) throw new Error("Proceso no encontrado");
      assertCompanyPersonnelManagementAccess(ctx, current.companyId);

      await db.delete(processes)
        .where(eq(processes.id, input.id));

      return { success: true };
    }),
});
