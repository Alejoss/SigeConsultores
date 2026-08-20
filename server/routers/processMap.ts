import { z } from "zod";
import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { companyProcedure, router } from "../_core/trpc";
import {
  getDb,
  getProcessMapImageDocument,
  deleteProcessMapImageDocument,
  createCompanyDocument,
  PROCESS_MAP_IMAGE_DOC_NAME,
} from "../db";
import { processes, accounts, accountRoles } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { getRoleIdBySlug } from "../accountAuth";
import { storagePut, storageGet, storageDelete } from "../storage";
import type { TrpcContext } from "../_core/context";

const PROCESS_MAP_ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

function fileNameFromStorageKey(fileKey: string): string {
  const base = fileKey.split("/").pop() ?? fileKey;
  const dash = base.indexOf("-");
  return dash >= 0 ? base.slice(dash + 1) : base;
}

function resolveProcessMapMime(fileName: string, fileType: string): string {
  if (fileType && PROCESS_MAP_ALLOWED_TYPES.has(fileType)) return fileType;
  const ext = fileName.toLowerCase().split(".").pop();
  const byExt: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    pdf: "application/pdf",
  };
  return byExt[ext ?? ""] ?? "application/octet-stream";
}

function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

/** La empresa enviada por la interfaz debe coincidir con el alcance de la cookie. */
function assertCompanyReadAccess(ctx: TrpcContext, companyId: number) {
  if (ctx.manager && ctx.manager.companyId !== companyId) {
    forbidden("No tiene acceso a la empresa solicitada.");
  }
  if (ctx.processLeader && ctx.processLeader.companyId !== companyId) {
    forbidden("No tiene acceso a la empresa solicitada.");
  }
}

/** La estructura del Mapa sólo la administran Gerente de la empresa o Administrador. */
function assertMapManagementAccess(ctx: TrpcContext, companyId: number) {
  assertCompanyReadAccess(ctx, companyId);
  if (ctx.processLeader) {
    forbidden("El Jefe de Proceso no puede modificar la estructura del Mapa de Procesos.");
  }
  if (ctx.manager || ctx.user?.role === "admin") return;
  forbidden("No tiene permisos para modificar el Mapa de Procesos.");
}

export const processMapRouter = router({
  list: companyProcedure
    .input(z.object({ companyId: z.number(), filterProcessId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      assertCompanyReadAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db) return [];

      // El Jefe no puede ampliar el alcance modificando URL o parámetros: el
      // proceso se toma exclusivamente del contexto autenticado del servidor.
      if (ctx.processLeader) {
        return db.select().from(processes).where(and(
          eq(processes.companyId, ctx.processLeader.companyId),
          eq(processes.id, ctx.processLeader.processId)
        ));
      }

      // Gerente y Administrador consultan todos los procesos de su empresa
      // autorizada. El parámetro filterProcessId ya no concede privilegios.
      return db.select().from(processes).where(eq(processes.companyId, input.companyId));
    }),

  get: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const result = await db.select().from(processes)
        .where(eq(processes.id, input.processId));
      const process = result[0] ?? null;
      if (!process) return null;

      assertCompanyReadAccess(ctx, process.companyId);
      if (ctx.processLeader && ctx.processLeader.processId !== process.id) {
        forbidden("No tiene acceso al proceso solicitado.");
      }
      return process;
    }),

  create: companyProcedure
    .input(z.object({
      companyId: z.number(),
      name: z.string().min(1),
      processType: z.enum(["estrategico", "misional", "soporte"]),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertMapManagementAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(processes).values({
        companyId: input.companyId,
        name: input.name,
        processType: input.processType,
        description: input.description || null,
      });

      return { success: true, message: "Proceso creado exitosamente" };
    }),

  update: companyProcedure
    .input(z.object({
      processId: z.number(),
      name: z.string().min(1),
      processType: z.enum(["estrategico", "misional", "soporte"]),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const target = await db.select({ companyId: processes.companyId }).from(processes)
        .where(eq(processes.id, input.processId)).limit(1);
      if (!target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "No se encontró el proceso solicitado." });
      assertMapManagementAccess(ctx, target[0].companyId);

      await db.update(processes)
        .set({
          name: input.name,
          processType: input.processType,
          description: input.description || null,
          updatedAt: new Date(),
        })
        .where(eq(processes.id, input.processId));

      return { success: true, message: "Proceso actualizado exitosamente" };
    }),

  rename: companyProcedure
    .input(
      z.object({
        companyId: z.number(),
        processId: z.number(),
        name: z.string().trim().min(1, "El nombre del proceso es obligatorio.").max(255),
        processType: z.enum(["estrategico", "misional", "soporte"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertMapManagementAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await db
        .update(processes)
        .set({ name: input.name, processType: input.processType, updatedAt: new Date() })
        .where(and(eq(processes.id, input.processId), eq(processes.companyId, input.companyId)));

      if (result[0].affectedRows === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No se encontró el proceso solicitado." });
      }

      return { success: true, name: input.name, processType: input.processType };
    }),

  delete: companyProcedure
    .input(z.object({ processId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const target = await db.select({ companyId: processes.companyId }).from(processes)
        .where(eq(processes.id, input.processId)).limit(1);
      if (!target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "No se encontró el proceso solicitado." });
      assertMapManagementAccess(ctx, target[0].companyId);

      await db.delete(processes)
        .where(eq(processes.id, input.processId));

      return { success: true, message: "Proceso eliminado exitosamente" };
    }),

  getMapImage: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompanyReadAccess(ctx, input.companyId);
      try {
        const doc = await getProcessMapImageDocument(input.companyId);
        if (!doc?.fileKey) return null;

        const { url } = await storageGet(doc.fileKey);
        const storedFileName = fileNameFromStorageKey(doc.fileKey);
        return {
          id: doc.id,
          fileName: storedFileName,
          fileUrl: url,
          mimeType: resolveProcessMapMime(storedFileName, ""),
        };
      } catch (error) {
        console.error("[ProcessMap] Error getting map image:", error);
        return null;
      }
    }),

  uploadMapImage: companyProcedure
    .input(
      z.object({
        companyId: z.number(),
        fileName: z.string(),
        fileData: z.array(z.number()),
        fileType: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertMapManagementAccess(ctx, input.companyId);
      try {
        const mimeType = resolveProcessMapMime(input.fileName, input.fileType);
        if (!PROCESS_MAP_ALLOWED_TYPES.has(mimeType)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Tipo de archivo no permitido. Use imágenes (PNG, JPG, etc.) o Excel (.xlsx, .xls)",
          });
        }

        const existing = await deleteProcessMapImageDocument(input.companyId);
        if (existing?.fileKey) {
          await storageDelete(existing.fileKey).catch((err) =>
            console.warn("[ProcessMap] S3 delete old image failed (non-fatal):", err)
          );
        }

        const fileBuffer = Buffer.from(input.fileData);
        const fileKey = `process-map/${input.companyId}/${randomUUID()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, fileBuffer, mimeType);

        await createCompanyDocument(
          input.companyId,
          PROCESS_MAP_IMAGE_DOC_NAME,
          "Varios",
          "Vigente",
          url,
          fileKey
        );

        return { success: true, fileName: input.fileName, fileUrl: url };
      } catch (error) {
        console.error("[ProcessMap] Error uploading map image:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al cargar la imagen del mapa de procesos",
        });
      }
    }),

  deleteMapImage: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertMapManagementAccess(ctx, input.companyId);
      try {
        const removed = await deleteProcessMapImageDocument(input.companyId);
        if (removed?.fileKey) {
          await storageDelete(removed.fileKey).catch((err) =>
            console.warn("[ProcessMap] S3 delete failed (non-fatal):", err)
          );
        }
        return { success: true };
      } catch (error) {
        console.error("[ProcessMap] Error deleting map image:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al eliminar la imagen del mapa de procesos",
        });
      }
    }),
});
