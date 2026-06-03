import { z } from "zod";
import { protectedProcedure, router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { procedures, procedureRecords } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { storagePut, storageGet, storageDelete } from "../storage";

export const proceduresRouter = router({
  /**
   * Create a new procedure
   */
  create: companyProcedure
    .input(
      z.object({
        processId: z.number(),
        name: z.string(),
        objective: z.string().optional(),
        code: z.string(),
        version: z.string(),
        createdDate: z.string().optional(),
        lastVersion: z.string().optional(),
        procedureFileUrl: z.string().optional(),
        procedureFileKey: z.string().optional(),
        flowchartFileUrl: z.string().optional(),
        flowchartFileKey: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Insert the procedure
      await db.insert(procedures).values({
        processId: input.processId,
        name: input.name,
        objective: input.objective,
        code: input.code,
        version: input.version,
        createdDate: input.createdDate || null,
        lastVersion: input.lastVersion,
        procedureFileUrl: input.procedureFileUrl,
        procedureFileKey: input.procedureFileKey,
        flowchartFileUrl: input.flowchartFileUrl,
        flowchartFileKey: input.flowchartFileKey,
      });

      // Query the created procedure to get its ID
      const createdProcedure = await db
        .select({ id: procedures.id })
        .from(procedures)
        .where(
          and(
            eq(procedures.processId, input.processId),
            eq(procedures.code, input.code)
          )
        )
        .orderBy(desc(procedures.id))
        .limit(1);

      if (!createdProcedure || createdProcedure.length === 0) {
        throw new Error("Failed to retrieve created procedure");
      }

      // Return the ID of the created procedure
      return { id: createdProcedure[0].id };
    }),

  /**
   * Get all procedures for a process
   */
  getByProcess: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await db
        .select()
        .from(procedures)
        .where(eq(procedures.processId, input.processId));

      return result;
    }),

  /**
   * Get a single procedure with its records
   */
  getById: companyProcedure
    .input(z.object({ procedureId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const procedure = await db
        .select()
        .from(procedures)
        .where(eq(procedures.id, input.procedureId));

      if (!procedure.length) throw new Error("Procedure not found");

      const records = await db
        .select()
        .from(procedureRecords)
        .where(eq(procedureRecords.procedureId, input.procedureId));

      const recordsWithFreshUrls = await Promise.all(
        records.map(async (rec) => {
          if (!rec.fileKey) return rec;
          try {
            const { url } = await storageGet(rec.fileKey);
            return { ...rec, fileUrl: url };
          } catch {
            return rec;
          }
        })
      );

      return {
        ...procedure[0],
        records: recordsWithFreshUrls,
      };
    }),

  /**
   * Update a procedure
   */
  update: companyProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        objective: z.string().optional(),
        code: z.string().optional(),
        version: z.string().optional(),
        createdDate: z.string().optional(),
        lastVersion: z.string().optional(),
        procedureFileUrl: z.string().optional(),
        procedureFileKey: z.string().optional(),
        flowchartFileUrl: z.string().optional(),
        flowchartFileKey: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { id, createdDate, ...updateData } = input;

      const result = await db
        .update(procedures)
        .set({
          ...updateData,
          createdDate: createdDate || undefined,
        })
        .where(eq(procedures.id, id));

      return result;
    }),

  /**
   * Delete a procedure (cleans up S3 files from records)
   */
  delete: companyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Clean up S3 files from associated records
      const records = await db
        .select({ fileKey: procedureRecords.fileKey })
        .from(procedureRecords)
        .where(eq(procedureRecords.procedureId, input.id));

      for (const rec of records) {
        if (rec.fileKey) {
          await storageDelete(rec.fileKey).catch(() => {});
        }
      }

      // Delete associated records
      await db
        .delete(procedureRecords)
        .where(eq(procedureRecords.procedureId, input.id));

      // Delete the procedure
      const result = await db
        .delete(procedures)
        .where(eq(procedures.id, input.id));

      return result;
    }),

  /**
   * Add a record to a procedure
   */
  addRecord: companyProcedure
    .input(
      z.object({
        procedureId: z.number(),
        name: z.string(),
        code: z.string(),
        version: z.string(),
        date: z.string().optional(),
        fileUrl: z.string().optional(),
        fileKey: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await db.insert(procedureRecords).values({
        procedureId: input.procedureId,
        name: input.name,
        code: input.code,
        version: input.version,
        date: input.date || null,
        fileUrl: input.fileUrl,
        fileKey: input.fileKey,
      });

      return result;
    }),

  /**
   * Update a procedure record
   */
  updateRecord: companyProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        code: z.string().optional(),
        version: z.string().optional(),
        date: z.string().optional(),
        fileUrl: z.string().optional(),
        fileKey: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { id, date, ...updateData } = input;

      const result = await db
        .update(procedureRecords)
        .set({
          ...updateData,
          date: date || undefined,
        })
        .where(eq(procedureRecords.id, id));

      return result;
    }),

  /**
   * Delete a procedure record (cleans up S3 file)
   */
  deleteRecord: companyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const rows = await db
        .select({ fileKey: procedureRecords.fileKey })
        .from(procedureRecords)
        .where(eq(procedureRecords.id, input.id))
        .limit(1);

      if (rows[0]?.fileKey) {
        await storageDelete(rows[0].fileKey).catch(() => {});
      }

      const result = await db
        .delete(procedureRecords)
        .where(eq(procedureRecords.id, input.id));

      return result;
    }),

  /**
   * Get a fresh pre-signed download URL for a file key
   */
  getDownloadUrl: companyProcedure
    .input(
      z.object({
        fileKey: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        const { url } = await storageGet(input.fileKey);
        return { url };
      } catch (error) {
        console.error("Error generating download URL:", error);
        throw new Error("No se pudo generar la URL de descarga");
      }
    }),

  /**
   * Upload a file to S3
   */
  uploadFile: companyProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileData: z.array(z.number()),
        fileType: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const buffer = Buffer.from(input.fileData);
        const userId = ctx.user?.id || 0;
        const fileKey = `procedures/${userId}/${Date.now()}-${input.fileName}`;
        const result = await storagePut(fileKey, buffer, input.fileType);
        return result;
      } catch (error) {
        console.error("Upload error:", error);
        throw new Error("Failed to upload file");
      }
    }),
});
