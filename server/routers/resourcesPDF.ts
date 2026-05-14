import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { processResources, processParticipants } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const resourcesPDFRouter = router({
  generatePDF: companyProcedure
    .input(z.object({ 
      processCharacterizationId: z.number(),
      processName: z.string().default("Proceso")
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get all participants
      const participants = await db.select().from(processParticipants)
        .where(eq(processParticipants.processCharacterizationId, input.processCharacterizationId));

      // Get all resources
      const resources = await db.select().from(processResources)
        .where(eq(processResources.processCharacterizationId, input.processCharacterizationId));

      // Group resources by participant
      const grouped = participants.map(p => ({
        participant: p,
        resources: resources.filter(r => r.participantId === p.id || r.participant === p.position)
      }));

      return {
        processName: input.processName,
        participants: grouped,
        generatedAt: new Date().toISOString()
      };
    }),
});
