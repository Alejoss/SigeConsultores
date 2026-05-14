import { z } from "zod";
import { protectedProcedure, router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { processParticipants } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const processParticipantsRouter = router({
  list: companyProcedure
    .input(z.object({ processCharacterizationId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const participants = await db.select().from(processParticipants)
        .where(eq(processParticipants.processCharacterizationId, input.processCharacterizationId));

      return participants;
    }),

  create: companyProcedure
    .input(z.object({
      processCharacterizationId: z.number(),
      position: z.string(),
      objective: z.string().optional(),
      responsibility: z.string().optional(),
      authority: z.string().optional(),
      orderIndex: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(processParticipants).values({
        processCharacterizationId: input.processCharacterizationId,
        position: input.position,
        objective: input.objective || null,
        responsibility: input.responsibility || null,
        authority: input.authority || null,
        orderIndex: input.orderIndex,
      });

      return { success: true };
    }),

  update: companyProcedure
    .input(z.object({
      id: z.number(),
      position: z.string(),
      objective: z.string().optional(),
      responsibility: z.string().optional(),
      authority: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(processParticipants)
        .set({
          position: input.position,
          objective: input.objective || null,
          responsibility: input.responsibility || null,
          authority: input.authority || null,
        })
        .where(eq(processParticipants.id, input.id));

      return { success: true };
    }),

  delete: companyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(processParticipants)
        .where(eq(processParticipants.id, input.id));

      return { success: true };
    }),
});
