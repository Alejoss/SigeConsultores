import { z } from "zod";
import { protectedProcedure, router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { processResources, processParticipants } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const processResourcesRouter = router({
  list: companyProcedure
    .input(z.object({ processCharacterizationId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const resources = await db.select().from(processResources)
        .where(eq(processResources.processCharacterizationId, input.processCharacterizationId));

      return resources;
    }),

  // Get resources grouped by participant
  listByParticipant: companyProcedure
    .input(z.object({ processCharacterizationId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const participants = await db.select().from(processParticipants)
        .where(eq(processParticipants.processCharacterizationId, input.processCharacterizationId));

      const resources = await db.select().from(processResources)
        .where(eq(processResources.processCharacterizationId, input.processCharacterizationId));

      // Group resources by participant
      const grouped = participants.map(p => ({
        participant: p,
        resources: resources.filter(r => r.participantId === p.id || r.participant === p.position)
      }));

      return grouped;
    }),

  create: companyProcedure
    .input(z.object({
      processCharacterizationId: z.number(),
      participantId: z.number().optional(),
      participant: z.string().optional(),
      resourceName: z.string().optional(),
      resourceElements: z.string().optional(),
      // Support old field names for backward compatibility
      resourceType: z.string().optional(),
      description: z.string().optional(),
      orderIndex: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Use new field names, fallback to old ones for backward compatibility
      // resourceType is required in the DB, so we must provide it
      const resourceType = input.resourceName || input.resourceType || "Recurso";
      const description = input.resourceElements || input.description || null;

      await db.insert(processResources).values({
        processCharacterizationId: input.processCharacterizationId,
        participantId: input.participantId || null,
        participant: input.participant || null,
        resourceType: resourceType, // Required field in DB
        description: description,
        resourceName: input.resourceName || null,
        resourceElements: input.resourceElements || null,
        orderIndex: input.orderIndex,
      });

      return { success: true };
    }),

  update: companyProcedure
    .input(z.object({
      id: z.number(),
      participantId: z.number().optional(),
      participant: z.string().optional(),
      resourceName: z.string().optional(),
      resourceElements: z.string().optional(),
      // Support old field names for backward compatibility
      resourceType: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const updateData: any = {};
      
      if (input.participantId !== undefined) updateData.participantId = input.participantId;
      if (input.participant !== undefined) updateData.participant = input.participant;
      if (input.resourceName !== undefined) {
        updateData.resourceName = input.resourceName;
        // Also update resourceType for backward compatibility
        updateData.resourceType = input.resourceName;
      }
      if (input.resourceElements !== undefined) {
        updateData.resourceElements = input.resourceElements;
        // Also update description for backward compatibility
        updateData.description = input.resourceElements;
      }
      if (input.resourceType !== undefined) updateData.resourceType = input.resourceType;
      if (input.description !== undefined) updateData.description = input.description;

      await db.update(processResources)
        .set(updateData)
        .where(eq(processResources.id, input.id));

      return { success: true };
    }),

  delete: companyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(processResources)
        .where(eq(processResources.id, input.id));

      return { success: true };
    }),
});
