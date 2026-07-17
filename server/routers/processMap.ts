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

export const processMapRouter = router({
  list: companyProcedure
    .input(z.object({ companyId: z.number(), processLeaderEmail: z.string().optional(), filterProcessId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // If filterProcessId is provided (process leader accessing via URL), return only that process
      if (input.filterProcessId) {
        const result = await db.select().from(processes)
          .where(and(
            eq(processes.companyId, input.companyId),
            eq(processes.id, input.filterProcessId)
          ));
        return result;
      }

      // Check if user is a process leader (passed via optional parameter)
      if (input.processLeaderEmail) {
        const emailNorm = input.processLeaderEmail.trim().toLowerCase();
        const plRoleId = await getRoleIdBySlug(db, "process_leader");
        if (plRoleId != null) {
          const leaderRows = await db
            .select({ processId: accountRoles.processId })
            .from(accounts)
            .innerJoin(accountRoles, eq(accountRoles.accountId, accounts.id))
            .where(
              and(
                sql`LOWER(${accounts.email}) = ${emailNorm}`,
                eq(accountRoles.roleId, plRoleId),
                eq(accountRoles.companyId, input.companyId)
              )
            )
            .limit(1);

          if (leaderRows.length && leaderRows[0].processId) {
            const result = await db
              .select()
              .from(processes)
              .where(
                and(eq(processes.companyId, input.companyId), eq(processes.id, leaderRows[0].processId))
              );
            return result;
          }
        }
      }

      // Otherwise, return all processes for the company (for managers/admins)
      const result = await db.select().from(processes)
        .where(eq(processes.companyId, input.companyId));

      return result;
    }),

  get: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const result = await db.select().from(processes)
        .where(eq(processes.id, input.processId));

      return result.length > 0 ? result[0] : null;
    }),

  create: companyProcedure
    .input(z.object({
      companyId: z.number(),
      name: z.string().min(1),
      processType: z.enum(["estrategico", "misional", "soporte"]),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

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

  delete: companyProcedure
    .input(z.object({ processId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(processes)
        .where(eq(processes.id, input.processId));

      return { success: true, message: "Proceso eliminado exitosamente" };
    }),

  getMapImage: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
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
    .mutation(async ({ input }) => {
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
    .mutation(async ({ input }) => {
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
