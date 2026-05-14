import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { processes, accounts, accountRoles } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { getRoleIdBySlug } from "../accountAuth";

export const processMapRouter = router({
  list: publicProcedure
    .input(z.object({ companyId: z.number(), processLeaderEmail: z.string().optional(), filterProcessId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // If filterProcessId is provided (process leader accessing via URL), return only that process
      if (input.filterProcessId) {
        const result = await db.select().from(processes)
          .where(and(
            eq(processes.companyId, input.companyId),
            eq(processes.id, input.filterProcessId)
          ));
        return result;
      }

      // Check if user is a process leader (passed via optional parameter)
      if (input.processLeaderEmail) {
        const emailNorm = input.processLeaderEmail.trim().toLowerCase();
        const plRoleId = await getRoleIdBySlug(db, "process_leader");
        if (plRoleId != null) {
          const leaderRows = await db
            .select({ processId: accountRoles.processId })
            .from(accounts)
            .innerJoin(accountRoles, eq(accountRoles.accountId, accounts.id))
            .where(
              and(
                sql`LOWER(${accounts.email}) = ${emailNorm}`,
                eq(accountRoles.roleId, plRoleId),
                eq(accountRoles.companyId, input.companyId)
              )
            )
            .limit(1);

          if (leaderRows.length && leaderRows[0].processId) {
            const result = await db
              .select()
              .from(processes)
              .where(
                and(eq(processes.companyId, input.companyId), eq(processes.id, leaderRows[0].processId))
              );
            return result;
          }
        }
      }

      // Otherwise, return all processes for the company (for managers/admins)
      const result = await db.select().from(processes)
        .where(eq(processes.companyId, input.companyId));

      return result;
    }),

  get: publicProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const result = await db.select().from(processes)
        .where(eq(processes.id, input.processId));

      return result.length > 0 ? result[0] : null;
    }),

  create: publicProcedure
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

      return { success: true, message: "Proceso creado exitosamente" };
    }),

  update: publicProcedure
    .input(z.object({
      processId: z.number(),
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
          updatedAt: new Date(),
        })
        .where(eq(processes.id, input.processId));

      return { success: true, message: "Proceso actualizado exitosamente" };
    }),

  delete: publicProcedure
    .input(z.object({ processId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(processes)
        .where(eq(processes.id, input.processId));

      return { success: true, message: "Proceso eliminado exitosamente" };
    }),
});
