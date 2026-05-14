import z from "zod";
import { protectedProcedure, router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { criticalityMatrix, stakeholders } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const criticalityMatrixRouter = router({
  getByProcessId: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const result = await db.select().from(criticalityMatrix)
        .where(eq(criticalityMatrix.processId, input.processId));

      return result;
    }),

  getWithStakeholders: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // Get all criticality entries for this process with stakeholder data
      const criticalityEntries = await db.select({
        id: criticalityMatrix.id,
        processId: criticalityMatrix.processId,
        stakeholderId: criticalityMatrix.stakeholderId,
        incidence: criticalityMatrix.incidence,
        risk: criticalityMatrix.risk,
        criticality: criticalityMatrix.criticality,
        existingDefenses: criticalityMatrix.existingDefenses,
        actionToTake: criticalityMatrix.actionToTake,
        observations: criticalityMatrix.observations,
        startDate: criticalityMatrix.startDate,
        endDate: criticalityMatrix.endDate,
        implementationStatus: criticalityMatrix.implementationStatus,
        completionPercentage: criticalityMatrix.completionPercentage,
        stakeholderName: stakeholders.name,
        stakeholderType: stakeholders.type,
        stakeholderIsInternal: stakeholders.isInternal,
      })
        .from(criticalityMatrix)
        .leftJoin(stakeholders, eq(criticalityMatrix.stakeholderId, stakeholders.id))
        .where(eq(criticalityMatrix.processId, input.processId));

      return criticalityEntries;
    }),

  upsert: companyProcedure
    .input(z.object({
      id: z.number().optional(),
      processId: z.number(),
      stakeholderId: z.number(),
      incidence: z.enum(["1", "2", "3"]),
      risk: z.enum(["A", "B", "C"]),
      criticality: z.string(),
      existingDefenses: z.string().optional(),
      actionToTake: z.string().optional(),
      observations: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      implementationStatus: z.boolean().optional(),
      completionPercentage: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      console.log("[criticalityMatrix.upsert] Input:", JSON.stringify(input));

      if (input.id) {
        // Update existing
        const updateData: any = {
          incidence: input.incidence,
          risk: input.risk,
          criticality: input.criticality,
          updatedAt: new Date(),
        };

        if (input.existingDefenses !== undefined) updateData.existingDefenses = input.existingDefenses || null;
        if (input.actionToTake !== undefined) updateData.actionToTake = input.actionToTake || null;
        if (input.observations !== undefined) updateData.observations = input.observations || null;
        if (input.startDate !== undefined) updateData.startDate = input.startDate ? new Date(input.startDate) : null;
        if (input.endDate !== undefined) updateData.endDate = input.endDate ? new Date(input.endDate) : null;
        if (input.implementationStatus !== undefined) updateData.implementationStatus = input.implementationStatus;
        if (input.completionPercentage !== undefined) updateData.completionPercentage = input.completionPercentage;

        console.log("[criticalityMatrix.upsert] Updating record with id:", input.id, "updateData:", updateData);

        await db.update(criticalityMatrix)
          .set(updateData)
          .where(eq(criticalityMatrix.id, input.id));

        console.log("[criticalityMatrix.upsert] Update successful");
        return { id: input.id, ...updateData };
      } else {
        // UPSERT: Check if record already exists for this stakeholder
        // If it does, update it instead of creating a new one
        const existingRecords = await db.select().from(criticalityMatrix)
          .where(and(
            eq(criticalityMatrix.processId, input.processId),
            eq(criticalityMatrix.stakeholderId, input.stakeholderId)
          ));

        console.log(`[criticalityMatrix.upsert] Found ${existingRecords.length} existing records for stakeholder ${input.stakeholderId}`);

        if (existingRecords.length > 0) {
          // Update the FIRST existing record (to avoid duplicates)
          const existingRecord = existingRecords[0];
          const updateData: any = {
            incidence: input.incidence,
            risk: input.risk,
            criticality: input.criticality,
            updatedAt: new Date(),
          };

          if (input.existingDefenses !== undefined) updateData.existingDefenses = input.existingDefenses || null;
          if (input.actionToTake !== undefined) updateData.actionToTake = input.actionToTake || null;
          if (input.observations !== undefined) updateData.observations = input.observations || null;
          if (input.startDate !== undefined) updateData.startDate = input.startDate ? new Date(input.startDate) : null;
          if (input.endDate !== undefined) updateData.endDate = input.endDate ? new Date(input.endDate) : null;
          if (input.implementationStatus !== undefined) updateData.implementationStatus = input.implementationStatus;
          if (input.completionPercentage !== undefined) updateData.completionPercentage = input.completionPercentage;

          console.log(`[criticalityMatrix.upsert] Updating existing record ${existingRecord.id}`);

          await db.update(criticalityMatrix)
            .set(updateData)
            .where(eq(criticalityMatrix.id, existingRecord.id));

          console.log(`[criticalityMatrix.upsert] Updated record ${existingRecord.id}`);
          return { id: existingRecord.id, ...updateData };
        } else {
          // Create new
          const newRecord = {
            processId: input.processId,
            stakeholderId: input.stakeholderId,
            incidence: input.incidence,
            risk: input.risk,
            criticality: input.criticality,
            existingDefenses: input.existingDefenses || null,
            actionToTake: input.actionToTake || null,
            observations: input.observations || null,
            startDate: input.startDate ? new Date(input.startDate) : null,
            endDate: input.endDate ? new Date(input.endDate) : null,
            implementationStatus: input.implementationStatus || false,
            completionPercentage: input.completionPercentage || 0,
          };

          console.log("[criticalityMatrix.upsert] Creating new record:", newRecord);

          const result = await db.insert(criticalityMatrix).values(newRecord as any);
          
          console.log("[criticalityMatrix.upsert] Insert result:", result);
          
          // Get the inserted record to return the correct ID
          const insertedRecords = await db.select().from(criticalityMatrix)
            .where(and(
              eq(criticalityMatrix.processId, input.processId),
              eq(criticalityMatrix.stakeholderId, input.stakeholderId)
            ))
            .orderBy(criticalityMatrix.id)
            .limit(1);

          const insertedId = insertedRecords.length > 0 ? insertedRecords[0].id : null;
          console.log("[criticalityMatrix.upsert] Inserted record ID:", insertedId);
          
          return { id: insertedId, ...newRecord };
        }
      }
    }),

  delete: companyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(criticalityMatrix)
        .where(eq(criticalityMatrix.id, input.id));

      return { success: true };
    }),

  // Get or create stakeholder by name
  getOrCreateStakeholder: companyProcedure
    .input(z.object({
      processId: z.number(),
      name: z.string(),
      type: z.enum(["cliente", "proveedor"]).optional(),
      isInternal: z.boolean().optional(),
      orderIndex: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      console.log("[criticalityMatrix.getOrCreateStakeholder] Input:", JSON.stringify(input));

      // Try to find existing stakeholder
      const existing = await db.select().from(stakeholders)
        .where(and(
          eq(stakeholders.processId, input.processId),
          eq(stakeholders.name, input.name)
        ))
        .limit(1);

      if (existing.length > 0) {
        console.log("[criticalityMatrix.getOrCreateStakeholder] Found existing stakeholder:", existing[0].id);
        return existing[0];
      }

      // Create new stakeholder
      const newStakeholder = {
        processId: input.processId,
        name: input.name,
        type: input.type || "cliente",
        isInternal: input.isInternal !== undefined ? input.isInternal : false,
        orderIndex: input.orderIndex || 0,
      };

      console.log("[criticalityMatrix.getOrCreateStakeholder] Creating new stakeholder:", newStakeholder);

      const result = await db.insert(stakeholders).values(newStakeholder as any);
      
      // Get the inserted record
      const insertedRecords = await db.select().from(stakeholders)
        .where(and(
          eq(stakeholders.processId, input.processId),
          eq(stakeholders.name, input.name)
        ))
        .limit(1);

      const insertedStakeholder = insertedRecords.length > 0 ? insertedRecords[0] : null;
      console.log("[criticalityMatrix.getOrCreateStakeholder] Inserted stakeholder:", insertedStakeholder?.id);
      
      return insertedStakeholder;
    }),
});
