import type { Express, Request, Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import {
  processOutputReleaseEvidence,
  processOutputReleasePeriods,
  processes,
} from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";
import { resolveAuthFromRequest } from "./_core/resolveRequestAuth";

const MAX_OUTPUT_RELEASE_EVIDENCE_BYTES = 50 * 1024 * 1024;
const OUTPUT_RELEASE_EVIDENCE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_OUTPUT_RELEASE_EVIDENCE_BYTES },
});

function positiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function registerProcessOutputReleaseUploadRoutes(app: Express) {
  app.post(
    "/api/upload/output-release-evidence",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const auth = await resolveAuthFromRequest(req);
        if (!auth.user && !auth.manager && !auth.processLeader) {
          return res.status(401).json({ ok: false, error: "No autenticado" });
        }
        const companyId = positiveId(req.body.companyId);
        const periodId = positiveId(req.body.periodId);
        if (!companyId || !periodId) {
          return res.status(400).json({ ok: false, error: "Datos de carga inválidos" });
        }
        if (!req.file) {
          return res.status(400).json({ ok: false, error: "No se recibió ningún archivo" });
        }
        if (!OUTPUT_RELEASE_EVIDENCE_MIME_TYPES.has(req.file.mimetype)) {
          return res.status(400).json({
            ok: false,
            error: "Solo se permiten evidencias PDF, imagen, Word o Excel",
          });
        }

        const db = await getDb();
        if (!db) return res.status(503).json({ ok: false, error: "Base de datos no disponible" });
        const [period] = await db
          .select({
            id: processOutputReleasePeriods.id,
            processId: processOutputReleasePeriods.processId,
            companyId: processes.companyId,
          })
          .from(processOutputReleasePeriods)
          .innerJoin(processes, eq(processOutputReleasePeriods.processId, processes.id))
          .where(eq(processOutputReleasePeriods.id, periodId))
          .limit(1);
        if (!period || period.companyId !== companyId) {
          return res.status(404).json({ ok: false, error: "Liberación programada no encontrada" });
        }
        const isPlatformAdmin = auth.user?.role === "admin";
        if (!isPlatformAdmin && auth.manager?.companyId !== companyId && auth.processLeader?.companyId !== companyId) {
          return res.status(403).json({ ok: false, error: "No tiene acceso a esta empresa" });
        }
        if (auth.processLeader && auth.processLeader.processId !== period.processId) {
          return res.status(403).json({
            ok: false,
            error: "Solo puede adjuntar evidencia a liberaciones de su proceso",
          });
        }

        const fileName = safeFileName(req.file.originalname);
        const fileKey = `output-releases/${companyId}/${period.id}/${randomUUID()}-${fileName}`;
        const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
        const created = await db.insert(processOutputReleaseEvidence).values({
          periodId: period.id,
          companyId,
          fileName,
          fileKey,
          fileUrl: url,
          mimeType: req.file.mimetype,
          fileSizeBytes: req.file.size,
          uploadedByAccountId: auth.user?.id ?? auth.processLeader?.processLeaderId ?? null,
        });
        return res.status(201).json({
          ok: true,
          id: Number(created[0].insertId),
          fileName,
          url,
        });
      } catch (error) {
        console.error("[output-release-evidence] Error:", error);
        return res.status(500).json({ ok: false, error: "No fue posible subir la evidencia" });
      }
    }
  );
}
