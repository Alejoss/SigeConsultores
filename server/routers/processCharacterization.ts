import { z } from "zod";
import { protectedProcedure, router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { processCharacterizations } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const processCharacterizationRouter = router({
  getByProcessId: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(processCharacterizations)
        .where(eq(processCharacterizations.processId, input.processId));
      return result.length > 0 ? result[0] : null;
    }),

  update: companyProcedure
    .input(z.object({
      processId: z.number(),
      macroProcess: z.string().optional(),
      responsible: z.string().optional(),
      responsibleEmail: z.string().email().optional().or(z.literal('')),
      participants: z.string().optional(),
      objective: z.string().optional(),
      scope: z.string().optional(),
      resources: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const existing = await db.select().from(processCharacterizations)
        .where(eq(processCharacterizations.processId, input.processId));

      if (existing.length > 0) {
        // Update existing record
        const updateData: any = {
          updatedAt: new Date(),
        };
        
        // Only update fields that are provided (not undefined)
        if (input.macroProcess !== undefined) updateData.macroProcess = input.macroProcess;
        if (input.responsible !== undefined) updateData.responsible = input.responsible;
        if (input.responsibleEmail !== undefined) updateData.responsibleEmail = input.responsibleEmail;
        if (input.participants !== undefined) updateData.participants = input.participants;
        if (input.objective !== undefined) updateData.objective = input.objective;
        if (input.scope !== undefined) updateData.scope = input.scope;
        if (input.resources !== undefined) updateData.resources = input.resources;

        await db.update(processCharacterizations)
          .set(updateData)
          .where(eq(processCharacterizations.processId, input.processId));
        
        return { ...existing[0], ...updateData };
      } else {
        // Create new record
        const newRecord = {
          processId: input.processId,
          macroProcess: input.macroProcess || null,
          responsible: input.responsible || null,
          responsibleEmail: input.responsibleEmail || null,
          participants: input.participants || null,
          objective: input.objective || null,
          scope: input.scope || null,
          resources: input.resources || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        await db.insert(processCharacterizations).values(newRecord);
        return newRecord;
      }
    }),
});
