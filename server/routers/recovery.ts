import z from "zod";
import { protectedProcedure, router, adminProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { recoveryAudit, companies as companies_table, processes as processes_table } from "../../drizzle/schema";
import { eq, or } from "drizzle-orm";

export const recoveryRouter = router({
  /**
   * Log a recovery event in the audit table
   */
  logRecovery: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyName: z.string(),
      backupFile: z.string(),
      backupDate: z.date(),
      modulesRecovered: z.array(z.string()),
      processesRecovered: z.array(z.object({
        id: z.number(),
        name: z.string(),
        processType: z.string(),
        parts: z.array(z.string()),
      })).optional(),
      recordsCount: z.number().optional(),
      status: z.enum(["success", "partial", "failed"]),
      errorMessage: z.string().optional(),
      performedByUserId: z.number(),
      performedByName: z.string(),
      reason: z.string().optional(),
      durationSeconds: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        const result = await db.insert(recoveryAudit).values({
          companyId: input.companyId,
          companyName: input.companyName,
          backupFile: input.backupFile,
          backupDate: input.backupDate,
          modulesRecovered: JSON.stringify(input.modulesRecovered),
          processesRecovered: input.processesRecovered ? JSON.stringify(input.processesRecovered) : null,
          recordsCount: input.recordsCount,
          status: input.status,
          errorMessage: input.errorMessage,
          performedByUserId: input.performedByUserId,
          performedByName: input.performedByName,
          reason: input.reason,
          durationSeconds: input.durationSeconds,
          notes: input.notes,
        });

        return {
          success: true,
          recoveryId: result[0],
        };
      } catch (error) {
        console.error("[Recovery] Error logging recovery:", error);
        throw error;
      }
    }),

  /**
   * List recovery events with pagination
   */
  listRecoveries: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      limit: z.number().default(10),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { recoveries: [], total: 0 };

      try {
        const whereConditions = input.companyId ? [eq(recoveryAudit.companyId, input.companyId)] : [];
        
        const recoveries = await db
          .select()
          .from(recoveryAudit)
          .where(whereConditions.length > 0 ? whereConditions[0] : undefined)
          .limit(input.limit)
          .offset(input.offset);

        const total = recoveries.length;

        return {
          recoveries: recoveries.map(r => ({
            ...r,
            modulesRecovered: typeof r.modulesRecovered === 'string'
              ? JSON.parse(r.modulesRecovered)
              : r.modulesRecovered,
          })),
          total,
        };
      } catch (error) {
        console.error("[Recovery] Error listing recoveries:", error);
        throw error;
      }
    }),

  /**
   * Get a specific recovery event
   */
  getRecovery: protectedProcedure
    .input(z.object({
      recoveryId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      try {
        const result = await db
          .select()
          .from(recoveryAudit)
          .where(eq(recoveryAudit.id, input.recoveryId))
          .limit(1);

        if (result.length === 0) return null;

        const recovery = result[0];
        return {
          ...recovery,
          modulesRecovered: typeof recovery.modulesRecovered === 'string'
            ? JSON.parse(recovery.modulesRecovered)
            : recovery.modulesRecovered,
        };
      } catch (error) {
        console.error("[Recovery] Error getting recovery:", error);
        throw error;
      }
    }),

  /**
   * Authorize a recovery event (admin only)
   */
  authorizeRecovery: adminProcedure
    .input(z.object({
      recoveryId: z.number(),
      authorizedByUserId: z.number(),
      authorizedByName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        await db
          .update(recoveryAudit)
          .set({
            authorizedByUserId: input.authorizedByUserId,
            authorizedByName: input.authorizedByName,
            authorizationDate: new Date(),
          })
          .where(eq(recoveryAudit.id, input.recoveryId));

        return { success: true };
      } catch (error) {
        console.error("[Recovery] Error authorizing recovery:", error);
        throw error;
      }
    }),

  /**
   * Get companies for dropdown selector
   */
  getCompanies: publicProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    try {
      const companies = await db
        .select({
          id: companies_table.id,
          name: companies_table.name,
        })
        .from(companies_table)
        .where(
          or(
            eq(companies_table.status, "Activa"),
            eq(companies_table.status, "En Proceso")
          )
        )
        .orderBy(companies_table.name);

      return companies;
    } catch (error) {
      console.error("[Recovery] Error fetching companies:", error);
      return [];
    }
  }),

  /**
   * Get processes for a company
   */
  getProcesses: publicProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      try {
        const processes = await db
          .select({
            id: processes_table.id,
            name: processes_table.name,
            processType: processes_table.processType,
            description: processes_table.description,
          })
          .from(processes_table)
          .where(eq(processes_table.companyId, input.companyId))
          .orderBy(processes_table.name);

        return processes;
      } catch (error) {
        console.error("[Recovery] Error fetching processes:", error);
        return [];
      }
    }),
});
