import z from "zod";
import { protectedProcedure, router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { stakeholderCriticalities, processStakeholderMatrixFiles } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { storagePut, storageGet } from "../storage";
import { randomUUID } from "crypto";

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

  uploadExcelMatrix: companyProcedure
    .input(z.object({
      processId: z.number(),
      fileName: z.string(),
      fileData: z.array(z.number()),
      mimeType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const fileBuffer = Buffer.from(input.fileData);
      const fileKey = `stakeholder-matrix/${input.processId}/${randomUUID()}-${input.fileName}`;
      const mimeType = input.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const { url } = await storagePut(fileKey, fileBuffer, mimeType);

      // Upsert: delete old record for this process if exists, then insert new
      await db.delete(processStakeholderMatrixFiles)
        .where(eq(processStakeholderMatrixFiles.processId, input.processId));

      await db.insert(processStakeholderMatrixFiles).values({
        processId: input.processId,
        fileName: input.fileName,
        fileKey,
      });

      return { success: true, url, fileName: input.fileName };
    }),

  getExcelMatrix: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const records = await db.select()
        .from(processStakeholderMatrixFiles)
        .where(eq(processStakeholderMatrixFiles.processId, input.processId))
        .limit(1);

      if (records.length === 0) return null;

      const record = records[0];
      try {
        const { url } = await storageGet(record.fileKey);
        return { fileName: record.fileName, url };
      } catch {
        return { fileName: record.fileName, url: null };
      }
    }),
});
