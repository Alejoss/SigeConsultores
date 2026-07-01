import { z } from "zod";
import { router, companyProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { eq, asc } from "drizzle-orm";
import { managementPrograms } from "../../drizzle/schema";
import { storagePut, storageGet, storageDelete } from "../storage";
import { randomUUID } from "crypto";

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
      await db.insert(managementPrograms).values({
        companyId: input.companyId,
        programName: input.programName,
        managementSystem: input.managementSystem,
        plannedActions: input.plannedActions,
        completedActions: input.completedActions,
      });
      const [inserted] = await db
        .select()
        .from(managementPrograms)
        .where(eq(managementPrograms.companyId, input.companyId))
        .orderBy(asc(managementPrograms.createdAt));
      return inserted;
    }),

  /** Actualizar un programa */
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
        .where(eq(managementPrograms.id, id));
      return { success: true };
    }),

  /** Eliminar un programa */
  delete: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const [program] = await db
        .select()
        .from(managementPrograms)
        .where(eq(managementPrograms.id, input.id));
      if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });
      // Eliminar archivo si existe
      if (program.planFileKey) {
        try { await storageDelete(program.planFileKey); } catch { /* ignorar */ }
      }
      await db.delete(managementPrograms).where(eq(managementPrograms.id, input.id));
      return { success: true };
    }),

  /** Subir archivo de planificación */
  uploadPlan: companyProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      fileName: z.string(),
      fileData: z.string(), // base64
      mimeType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const [program] = await db
        .select()
        .from(managementPrograms)
        .where(eq(managementPrograms.id, input.id));
      if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });
      // Eliminar archivo anterior si existe
      if (program.planFileKey) {
        try { await storageDelete(program.planFileKey); } catch { /* ignorar */ }
      }
      const fileBuffer = Buffer.from(input.fileData, "base64");
      const fileKey = `management-programs/${input.companyId}/${input.id}/${randomUUID()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
      await db
        .update(managementPrograms)
        .set({ planFileKey: fileKey, planFileName: input.fileName })
        .where(eq(managementPrograms.id, input.id));
      return { success: true, url };
    }),

  /** Obtener URL del archivo de planificación */
  getPlanUrl: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const [program] = await db
        .select()
        .from(managementPrograms)
        .where(eq(managementPrograms.id, input.id));
      if (!program || !program.planFileKey) return null;
      try {
        const { url } = await storageGet(program.planFileKey);
        return { url, fileName: program.planFileName };
      } catch { return null; }
    }),
});
