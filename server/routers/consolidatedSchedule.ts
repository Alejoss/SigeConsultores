import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { criticalityMatrix } from "../../drizzle/schema";
import { companyProcedure, router } from "../_core/trpc";
import {
  getConsolidatedScheduleActivities,
  type ConsolidatedScheduleActivity,
} from "../lib/consolidatedScheduleActivities";

export type ScheduleActivity = ConsolidatedScheduleActivity;

export const consolidatedScheduleRouter = router({
  debugCriticality: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { error: "No DB" };

      const criticalityEntries = await db
        .select()
        .from(criticalityMatrix)
        .where(eq(criticalityMatrix.processId, input.processId));

      return {
        totalRows: criticalityEntries.length,
        entries: criticalityEntries.map((entry: any) => ({
          id: entry.id,
          stakeholderId: entry.stakeholderId,
          actionToTake: entry.actionToTake,
          startDate: entry.startDate,
          endDate: entry.endDate,
          actionLength: entry.actionToTake?.length || 0,
          actionHash: entry.actionToTake?.substring(0, 50) || "NULL",
        })),
      };
    }),

  getConsolidatedSchedule: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => getConsolidatedScheduleActivities(input.processId)),
});
