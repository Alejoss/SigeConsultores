import type { Express, Request, Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { managementProgramFiles, managementPrograms } from "../drizzle/schema";
import { storagePut } from "./storage";
import { resolveAuthFromRequest } from "./_core/resolveRequestAuth";

const MAX_PROGRAM_FILE_BYTES = 50 * 1024 * 1024;
const PROGRAM_FILE_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PROGRAM_FILE_BYTES },
});

function getPositiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function registerManagementProgramUploadRoutes(app: Express) {
  app.post(
    "/api/upload/management-program-documentation",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const auth = await resolveAuthFromRequest(req);
        if (!auth.user && !auth.manager && !auth.processLeader) {
          return res.status(401).json({ ok: false, error: "No autenticado" });
        }

        const companyId = getPositiveId(req.body.companyId);
        const programId = getPositiveId(req.body.programId);
        if (!companyId || !programId) {
          return res.status(400).json({ ok: false, error: "Empresa o programa inválido" });
        }
        if (!req.file) {
          return res.status(400).json({ ok: false, error: "No se recibió ningún documento" });
        }
        if (!PROGRAM_FILE_MIME_TYPES.has(req.file.mimetype)) {
          return res.status(400).json({ ok: false, error: "Solo se permiten archivos PDF, Word o Excel" });
        }

        const db = await getDb();
        if (!db) return res.status(503).json({ ok: false, error: "Base de datos no disponible" });
        const [program] = await db
          .select({ id: managementPrograms.id })
          .from(managementPrograms)
          .where(and(
            eq(managementPrograms.id, programId),
            eq(managementPrograms.companyId, companyId)
          ));
        if (!program) return res.status(404).json({ ok: false, error: "Programa no encontrado" });

        const originalName = safeFileName(req.file.originalname);
        const fileKey = `management-programs/${companyId}/${programId}/documentation/${randomUUID()}-${originalName}`;
        const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
        const insertResult = await db.insert(managementProgramFiles).values({
          programId,
          companyId,
          fileName: req.file.originalname,
          fileUrl: url,
          fileKey,
          fileSizeBytes: req.file.size,
        });

        return res.status(201).json({
          ok: true,
          id: Number(insertResult[0].insertId),
          fileName: req.file.originalname,
          url,
        });
      } catch (error) {
        console.error("[management-program-documentation] Error:", error);
        return res.status(500).json({ ok: false, error: "No fue posible subir el documento" });
      }
    }
  );
}
