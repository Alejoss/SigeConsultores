import z from "zod";
import { protectedProcedure, router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { stakeholderCriticalities } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const processStakeholderCriticalityRouter = router({
  getByProcessId: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const result = await db.select().from(stakeholderCriticalities)
        .where(eq(stakeholderCriticalities.processId, input.processId));

      return result;
    }),

  upsert: companyProcedure
    .input(z.object({
      id: z.number().optional(),
      processId: z.number(),
      name: z.string(),
      type: z.string().optional(),
      influence: z.number().optional(),
      dependence: z.number().optional(),
      criticality: z.number().optional(),
      accionATomar: z.string().optional(),
      fechaInicio: z.string().optional(),
      fechaFin: z.string().optional(),
      realizado: z.enum(["SI", "NO"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      console.log("[upsert] Input:", JSON.stringify(input));

      if (input.id) {
        // Update existing
        const updateData: any = {
          name: input.name,
          updatedAt: new Date(),
        };

        if (input.type !== undefined) updateData.type = input.type;
        if (input.influence !== undefined) updateData.influence = input.influence;
        if (input.dependence !== undefined) updateData.dependence = input.dependence;
        if (input.criticality !== undefined) updateData.criticality = input.criticality;
        if (input.accionATomar !== undefined) updateData.accionATomar = input.accionATomar;
        if (input.fechaInicio !== undefined) updateData.fechaInicio = input.fechaInicio ? new Date(input.fechaInicio) : null;
        if (input.fechaFin !== undefined) updateData.fechaFin = input.fechaFin ? new Date(input.fechaFin) : null;
        if (input.realizado !== undefined) updateData.realizado = input.realizado;

        console.log("[upsert] Updating record with id:", input.id, "updateData:", updateData);

        await db.update(stakeholderCriticalities)
          .set(updateData)
          .where(eq(stakeholderCriticalities.id, input.id));

        console.log("[upsert] Update successful");
        return { id: input.id, ...updateData };
      } else {
        // Create new
        const newRecord = {
          processId: input.processId,
          name: input.name,
          type: input.type || null,
          influence: input.influence || null,
          dependence: input.dependence || null,
          criticality: input.criticality || null,
          accionATomar: input.accionATomar || null,
          fechaInicio: input.fechaInicio ? new Date(input.fechaInicio) : null,
          fechaFin: input.fechaFin ? new Date(input.fechaFin) : null,
          realizado: input.realizado || "NO",
        };

        console.log("[upsert] Creating new record:", newRecord);

        const result = await db.insert(stakeholderCriticalities).values(newRecord as any);
        
        console.log("[upsert] Insert result:", result);
        
        // Get the inserted record to return the correct ID
        const insertedRecords = await db.select().from(stakeholderCriticalities)
          .where(and(
            eq(stakeholderCriticalities.processId, input.processId),
            eq(stakeholderCriticalities.name, input.name)
          ))
          .orderBy(stakeholderCriticalities.id)
          .limit(1);

        const insertedId = insertedRecords.length > 0 ? insertedRecords[0].id : null;
        console.log("[upsert] Inserted record ID:", insertedId);
        
        return { id: insertedId, ...newRecord };
      }
    }),

  delete: companyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(stakeholderCriticalities)
        .where(eq(stakeholderCriticalities.id, input.id));

      return { success: true };
    }),
});
