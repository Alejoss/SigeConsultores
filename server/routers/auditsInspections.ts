import { z } from "zod";
import { router, companyProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { eq, and, asc } from "drizzle-orm";
import {
  managementSystems,
  managementSystemFiles,
  audits,
  auditFiles,
  inspections,
  inspectionFiles,
} from "../../drizzle/schema";
import { storagePut, storageGet, storageDelete } from "../storage";
import { randomUUID } from "crypto";

// ─── SISTEMA DE GESTIÓN ───────────────────────────────────────────────────────

export const auditsInspectionsRouter = router({

  // ── Management Systems ──────────────────────────────────────────────────────

  /** Listar todos los sistemas de gestión de una empresa */
  listManagementSystems: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      return db
        .select()
        .from(managementSystems)
        .where(eq(managementSystems.companyId, input.companyId))
        .orderBy(asc(managementSystems.orderIndex));
    }),

  /** Crear un nuevo sistema de gestión */
  createManagementSystem: companyProcedure
    .input(z.object({
      companyId: z.number(),
      systemName: z.string().default(""),
      certification: z.string().default(""),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const existing = await db
        .select({ id: managementSystems.id })
        .from(managementSystems)
        .where(eq(managementSystems.companyId, input.companyId));
      await db.insert(managementSystems).values({
        companyId: input.companyId,
        systemName: input.systemName,
        certification: input.certification,
        orderIndex: existing.length,
      });
      const inserted = await db
        .select()
        .from(managementSystems)
        .where(eq(managementSystems.companyId, input.companyId))
        .orderBy(asc(managementSystems.orderIndex));
      return inserted[inserted.length - 1];
    }),

  /** Actualizar un sistema de gestión (autosave) */
  updateManagementSystem: companyProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      systemName: z.string().optional(),
      certification: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      await db
        .update(managementSystems)
        .set({
          ...(input.systemName !== undefined && { systemName: input.systemName }),
          ...(input.certification !== undefined && { certification: input.certification }),
        })
        .where(and(
          eq(managementSystems.id, input.id),
          eq(managementSystems.companyId, input.companyId)
        ));
      return { success: true };
    }),

  /** Eliminar un sistema de gestión */
  deleteManagementSystem: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      // Eliminar archivos asociados
      const files = await db
        .select()
        .from(managementSystemFiles)
        .where(eq(managementSystemFiles.managementSystemId, input.id));
      for (const file of files) {
        try { await storageDelete(file.fileKey); } catch { /* ignorar */ }
      }
      await db.delete(managementSystemFiles).where(eq(managementSystemFiles.managementSystemId, input.id));
      await db.delete(managementSystems).where(and(
        eq(managementSystems.id, input.id),
        eq(managementSystems.companyId, input.companyId)
      ));
      return { success: true };
    }),

  /** Subir archivo (certificación o checklist) a un sistema de gestión */
  uploadManagementSystemFile: companyProcedure
    .input(z.object({
      managementSystemId: z.number(),
      companyId: z.number(),
      fileType: z.enum(["certification", "checklist"]),
      fileName: z.string(),
      fileData: z.array(z.number()),
      mimeType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const validTypes = [
        "application/pdf",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ];
      if (!validTypes.includes(input.mimeType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Solo se permiten archivos PDF o Excel" });
      }
      const fileBuffer = Buffer.from(input.fileData);
      const fileKey = `audits/${input.companyId}/management/${randomUUID()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
      await db.insert(managementSystemFiles).values({
        managementSystemId: input.managementSystemId,
        companyId: input.companyId,
        fileType: input.fileType,
        fileName: input.fileName,
        fileUrl: url,
        fileKey,
      });
      return { success: true, url };
    }),

  /** Listar archivos de un sistema de gestión con URLs frescas */
  listManagementSystemFiles: companyProcedure
    .input(z.object({
      managementSystemId: z.number(),
      companyId: z.number(),
      fileType: z.enum(["certification", "checklist"]),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const files = await db
        .select()
        .from(managementSystemFiles)
        .where(and(
          eq(managementSystemFiles.managementSystemId, input.managementSystemId),
          eq(managementSystemFiles.companyId, input.companyId),
          eq(managementSystemFiles.fileType, input.fileType)
        ));
      return Promise.all(files.map(async (f) => {
        try {
          const { url } = await storageGet(f.fileKey);
          return { ...f, fileUrl: url };
        } catch { return f; }
      }));
    }),

  /** Eliminar archivo de sistema de gestión */
  deleteManagementSystemFile: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const [file] = await db.select().from(managementSystemFiles).where(eq(managementSystemFiles.id, input.id));
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "Archivo no encontrado" });
      try { await storageDelete(file.fileKey); } catch { /* ignorar */ }
      await db.delete(managementSystemFiles).where(eq(managementSystemFiles.id, input.id));
      return { success: true };
    }),

  // ── Audits ──────────────────────────────────────────────────────────────────

  /** Listar auditorías de una empresa */
  listAudits: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(audits)
        .where(eq(audits.companyId, input.companyId))
        .orderBy(asc(audits.orderIndex));
    }),

  /** Crear nueva auditoría */
  createAudit: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const existing = await db
        .select({ id: audits.id })
        .from(audits)
        .where(eq(audits.companyId, input.companyId));
      await db.insert(audits).values({
        companyId: input.companyId,
        managementSystem: "",
        auditDate: "",
        auditType: "Interna",
        findingsObservations: 0,
        findingsMajorNC: 0,
        findingsMinorNC: 0,
        closuresObservations: 0,
        closuresMajorNC: 0,
        closuresMinorNC: 0,
        orderIndex: existing.length,
      });
      const all = await db
        .select()
        .from(audits)
        .where(eq(audits.companyId, input.companyId))
        .orderBy(asc(audits.orderIndex));
      return all[all.length - 1];
    }),

  /** Actualizar auditoría (autosave) */
  updateAudit: companyProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      managementSystem: z.string().optional(),
      auditDate: z.string().optional(),
      auditType: z.enum(["Interna", "Externa"]).optional(),
      findingsObservations: z.number().optional(),
      findingsMajorNC: z.number().optional(),
      findingsMinorNC: z.number().optional(),
      closuresObservations: z.number().optional(),
      closuresMajorNC: z.number().optional(),
      closuresMinorNC: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const { id, companyId, ...fields } = input;
      const updateData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updateData[k] = v;
      }
      await db.update(audits).set(updateData).where(and(
        eq(audits.id, id),
        eq(audits.companyId, companyId)
      ));
      return { success: true };
    }),

  /** Eliminar auditoría */
  deleteAudit: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const files = await db.select().from(auditFiles).where(eq(auditFiles.auditId, input.id));
      for (const f of files) {
        try { await storageDelete(f.fileKey); } catch { /* ignorar */ }
      }
      await db.delete(auditFiles).where(eq(auditFiles.auditId, input.id));
      await db.delete(audits).where(and(eq(audits.id, input.id), eq(audits.companyId, input.companyId)));
      return { success: true };
    }),

  /** Subir archivo de hallazgos de una auditoría */
  uploadAuditFile: companyProcedure
    .input(z.object({
      auditId: z.number(),
      companyId: z.number(),
      fileName: z.string(),
      fileData: z.array(z.number()),
      mimeType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const validTypes = [
        "application/pdf",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ];
      if (!validTypes.includes(input.mimeType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Solo se permiten archivos PDF o Excel" });
      }
      const fileBuffer = Buffer.from(input.fileData);
      const fileKey = `audits/${input.companyId}/audit-files/${randomUUID()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
      await db.insert(auditFiles).values({
        auditId: input.auditId,
        companyId: input.companyId,
        fileName: input.fileName,
        fileUrl: url,
        fileKey,
      });
      return { success: true, url };
    }),

  /** Listar archivos de hallazgos de una auditoría */
  listAuditFiles: companyProcedure
    .input(z.object({ auditId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const files = await db
        .select()
        .from(auditFiles)
        .where(and(eq(auditFiles.auditId, input.auditId), eq(auditFiles.companyId, input.companyId)));
      return Promise.all(files.map(async (f) => {
        try {
          const { url } = await storageGet(f.fileKey);
          return { ...f, fileUrl: url };
        } catch { return f; }
      }));
    }),

  /** Eliminar archivo de hallazgos de auditoría */
  deleteAuditFile: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const [file] = await db.select().from(auditFiles).where(eq(auditFiles.id, input.id));
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "Archivo no encontrado" });
      try { await storageDelete(file.fileKey); } catch { /* ignorar */ }
      await db.delete(auditFiles).where(eq(auditFiles.id, input.id));
      return { success: true };
    }),

  // ── Inspections ─────────────────────────────────────────────────────────────

  /** Listar inspecciones de una empresa */
  listInspections: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(inspections)
        .where(eq(inspections.companyId, input.companyId))
        .orderBy(asc(inspections.orderIndex));
    }),

  /** Crear nueva inspección */
  createInspection: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const existing = await db
        .select({ id: inspections.id })
        .from(inspections)
        .where(eq(inspections.companyId, input.companyId));
      await db.insert(inspections).values({
        companyId: input.companyId,
        managementSystem: "",
        inspectionDate: "",
        area: "",
        findings: 0,
        closures: 0,
        orderIndex: existing.length,
      });
      const all = await db
        .select()
        .from(inspections)
        .where(eq(inspections.companyId, input.companyId))
        .orderBy(asc(inspections.orderIndex));
      return all[all.length - 1];
    }),

  /** Actualizar inspección (autosave) */
  updateInspection: companyProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      managementSystem: z.string().optional(),
      inspectionDate: z.string().optional(),
      area: z.string().optional(),
      findings: z.number().optional(),
      closures: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const { id, companyId, ...fields } = input;
      const updateData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updateData[k] = v;
      }
      await db.update(inspections).set(updateData).where(and(
        eq(inspections.id, id),
        eq(inspections.companyId, companyId)
      ));
      return { success: true };
    }),

  /** Eliminar inspección */
  deleteInspection: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const files = await db.select().from(inspectionFiles).where(eq(inspectionFiles.inspectionId, input.id));
      for (const f of files) {
        try { await storageDelete(f.fileKey); } catch { /* ignorar */ }
      }
      await db.delete(inspectionFiles).where(eq(inspectionFiles.inspectionId, input.id));
      await db.delete(inspections).where(and(eq(inspections.id, input.id), eq(inspections.companyId, input.companyId)));
      return { success: true };
    }),

  /** Subir archivo de hallazgos de una inspección */
  uploadInspectionFile: companyProcedure
    .input(z.object({
      inspectionId: z.number(),
      companyId: z.number(),
      fileName: z.string(),
      fileData: z.array(z.number()),
      mimeType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const validTypes = [
        "application/pdf",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ];
      if (!validTypes.includes(input.mimeType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Solo se permiten archivos PDF o Excel" });
      }
      const fileBuffer = Buffer.from(input.fileData);
      const fileKey = `audits/${input.companyId}/inspection-files/${randomUUID()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
      await db.insert(inspectionFiles).values({
        inspectionId: input.inspectionId,
        companyId: input.companyId,
        fileName: input.fileName,
        fileUrl: url,
        fileKey,
      });
      return { success: true, url };
    }),

  /** Listar archivos de hallazgos de una inspección */
  listInspectionFiles: companyProcedure
    .input(z.object({ inspectionId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const files = await db
        .select()
        .from(inspectionFiles)
        .where(and(eq(inspectionFiles.inspectionId, input.inspectionId), eq(inspectionFiles.companyId, input.companyId)));
      return Promise.all(files.map(async (f) => {
        try {
          const { url } = await storageGet(f.fileKey);
          return { ...f, fileUrl: url };
        } catch { return f; }
      }));
    }),

  /** Eliminar archivo de hallazgos de inspección */
  deleteInspectionFile: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
      const [file] = await db.select().from(inspectionFiles).where(eq(inspectionFiles.id, input.id));
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "Archivo no encontrado" });
      try { await storageDelete(file.fileKey); } catch { /* ignorar */ }
      await db.delete(inspectionFiles).where(eq(inspectionFiles.id, input.id));
      return { success: true };
    }),
});
