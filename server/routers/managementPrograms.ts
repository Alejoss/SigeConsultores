import { z } from "zod";
import { router, companyProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { and, asc, eq } from "drizzle-orm";
import { managementProgramFiles, managementPrograms } from "../../drizzle/schema";
import { storageDelete, storageGet, storagePut } from "../storage";
import { randomUUID } from "crypto";

const PROGRAM_FILE_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;
const MAX_PROGRAM_FILE_BYTES = 50 * 1024 * 1024;

function assertValidProgramFile(mimeType: string, bytes: number) {
  if (!PROGRAM_FILE_MIME_TYPES.includes(mimeType as (typeof PROGRAM_FILE_MIME_TYPES)[number])) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Solo se permiten archivos PDF, Word o Excel",
    });
  }
  if (bytes > MAX_PROGRAM_FILE_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "El archivo no debe superar 50 MB",
    });
  }
}

export const managementProgramsRouter = router({
  /** Listar todos los programas de una empresa */
  list: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      return db
        .select()
        .from(managementPrograms)
        .where(eq(managementPrograms.companyId, input.companyId))
        .orderBy(asc(managementPrograms.createdAt));
    }),

  /** Crear un nuevo programa */
  create: companyProcedure
    .input(z.object({
      companyId: z.number(),
      programName: z.string().min(1),
      managementSystem: z.string().default("Calidad"),
      plannedActions: z.number().default(0),
      completedActions: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const insertResult = await db.insert(managementPrograms).values({
        companyId: input.companyId,
        programName: input.programName,
        managementSystem: input.managementSystem,
        plannedActions: input.plannedActions,
        completedActions: input.completedActions,
      });
      const [inserted] = await db
        .select()
        .from(managementPrograms)
        .where(eq(managementPrograms.id, Number(insertResult[0].insertId)));
      return inserted;
    }),

  /** Actualizar campos de un programa mediante autosave */
  update: companyProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      programName: z.string().optional(),
      managementSystem: z.string().optional(),
      plannedActions: z.number().optional(),
      completedActions: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const { id, companyId, ...updateData } = input;
      await db
        .update(managementPrograms)
        .set(updateData)
        .where(and(eq(managementPrograms.id, id), eq(managementPrograms.companyId, companyId)));
      return { success: true };
    }),

  /** Eliminar un programa y todos sus archivos asociados */
  delete: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const [program] = await db
        .select()
        .from(managementPrograms)
        .where(and(eq(managementPrograms.id, input.id), eq(managementPrograms.companyId, input.companyId)));
      if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });

      if (program.planFileKey) {
        try { await storageDelete(program.planFileKey); } catch { /* La referencia en BD siempre se elimina. */ }
      }
      const documentation = await db
        .select()
        .from(managementProgramFiles)
        .where(and(
          eq(managementProgramFiles.programId, input.id),
          eq(managementProgramFiles.companyId, input.companyId)
        ));
      for (const file of documentation) {
        try { await storageDelete(file.fileKey); } catch { /* La referencia en BD siempre se elimina. */ }
      }
      await db.delete(managementProgramFiles).where(and(
        eq(managementProgramFiles.programId, input.id),
        eq(managementProgramFiles.companyId, input.companyId)
      ));
      await db.delete(managementPrograms).where(and(
        eq(managementPrograms.id, input.id),
        eq(managementPrograms.companyId, input.companyId)
      ));
      return { success: true };
    }),

  /** Reemplazar el archivo único de planificación de un programa */
  uploadPlan: companyProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      fileName: z.string().min(1),
      fileData: z.array(z.number().int().min(0).max(255)),
      mimeType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const [program] = await db
        .select()
        .from(managementPrograms)
        .where(and(eq(managementPrograms.id, input.id), eq(managementPrograms.companyId, input.companyId)));
      if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });

      const fileBuffer = Buffer.from(input.fileData);
      assertValidProgramFile(input.mimeType, fileBuffer.length);
      if (program.planFileKey) {
        try { await storageDelete(program.planFileKey); } catch { /* El nuevo archivo conserva la referencia actualizada. */ }
      }
      const fileKey = `management-programs/${input.companyId}/${input.id}/planning/${randomUUID()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
      await db
        .update(managementPrograms)
        .set({ planFileKey: fileKey, planFileName: input.fileName })
        .where(and(eq(managementPrograms.id, input.id), eq(managementPrograms.companyId, input.companyId)));
      return { success: true, url };
    }),

  /** Obtener una URL vigente para la planificación */
  getPlanUrl: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const [program] = await db
        .select()
        .from(managementPrograms)
        .where(and(eq(managementPrograms.id, input.id), eq(managementPrograms.companyId, input.companyId)));
      if (!program || !program.planFileKey) return null;
      try {
        const { url } = await storageGet(program.planFileKey);
        return { url, fileName: program.planFileName };
      } catch {
        return null;
      }
    }),

  /** Subir uno de los múltiples documentos de respaldo de un programa */
  uploadDocumentation: companyProcedure
    .input(z.object({
      programId: z.number(),
      companyId: z.number(),
      fileName: z.string().min(1),
      fileData: z.array(z.number().int().min(0).max(255)),
      mimeType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const [program] = await db
        .select({ id: managementPrograms.id })
        .from(managementPrograms)
        .where(and(
          eq(managementPrograms.id, input.programId),
          eq(managementPrograms.companyId, input.companyId)
        ));
      if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });

      const fileBuffer = Buffer.from(input.fileData);
      assertValidProgramFile(input.mimeType, fileBuffer.length);
      const fileKey = `management-programs/${input.companyId}/${input.programId}/documentation/${randomUUID()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
      const insertResult = await db.insert(managementProgramFiles).values({
        programId: input.programId,
        companyId: input.companyId,
        fileName: input.fileName,
        fileUrl: url,
        fileKey,
        fileSizeBytes: fileBuffer.length,
      });
      return { success: true, id: Number(insertResult[0].insertId), url };
    }),

  /** Listar documentación con URLs vigentes */
  listDocumentation: companyProcedure
    .input(z.object({ programId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const files = await db
        .select()
        .from(managementProgramFiles)
        .where(and(
          eq(managementProgramFiles.programId, input.programId),
          eq(managementProgramFiles.companyId, input.companyId)
        ))
        .orderBy(asc(managementProgramFiles.uploadedAt));
      return Promise.all(files.map(async (file) => {
        try {
          const { url } = await storageGet(file.fileKey);
          return { ...file, fileUrl: url };
        } catch {
          return file;
        }
      }));
    }),

  /** Eliminar un documento específico de respaldo */
  deleteDocumentation: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const [file] = await db
        .select()
        .from(managementProgramFiles)
        .where(and(
          eq(managementProgramFiles.id, input.id),
          eq(managementProgramFiles.companyId, input.companyId)
        ));
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "Documento no encontrado" });
      try { await storageDelete(file.fileKey); } catch { /* La referencia en BD siempre se elimina. */ }
      await db.delete(managementProgramFiles).where(and(
        eq(managementProgramFiles.id, input.id),
        eq(managementProgramFiles.companyId, input.companyId)
      ));
      return { success: true };
    }),
});
