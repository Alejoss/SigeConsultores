import type { Express, Request, Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import {
  companyCompliances,
  linkedCommitmentEvidence,
  linkedCommitments,
} from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";
import { resolveAuthFromRequest } from "./_core/resolveRequestAuth";

const MAX_LINKED_COMMITMENT_EVIDENCE_BYTES = 50 * 1024 * 1024;
const LINKED_COMMITMENT_EVIDENCE_MIME_TYPES = new Set([
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
  limits: { fileSize: MAX_LINKED_COMMITMENT_EVIDENCE_BYTES },
});

function positiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function registerLinkedCommitmentUploadRoutes(app: Express) {
  app.post(
    "/api/upload/linked-commitment-evidence",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const auth = await resolveAuthFromRequest(req);
        if (!auth.user && !auth.manager && !auth.processLeader) {
          return res.status(401).json({ ok: false, error: "No autenticado" });
        }
        const companyId = positiveId(req.body.companyId);
        const linkedCommitmentId = positiveId(req.body.linkedCommitmentId);
        if (!companyId || !linkedCommitmentId) {
          return res
            .status(400)
            .json({ ok: false, error: "Datos de carga inválidos" });
        }
        const isPlatformAdmin = auth.user?.role === "admin";
        const roleCompanyId =
          auth.manager?.companyId ?? auth.processLeader?.companyId;
        if (!isPlatformAdmin && roleCompanyId !== companyId) {
          return res
            .status(403)
            .json({ ok: false, error: "No tiene acceso a esta empresa" });
        }
        if (!req.file) {
          return res
            .status(400)
            .json({ ok: false, error: "No se recibió ningún archivo" });
        }
        if (!LINKED_COMMITMENT_EVIDENCE_MIME_TYPES.has(req.file.mimetype)) {
          return res
            .status(400)
            .json({
              ok: false,
              error: "Solo se permiten evidencias PDF, imagen, Word o Excel",
            });
        }

        const db = await getDb();
        if (!db)
          return res
            .status(503)
            .json({ ok: false, error: "Base de datos no disponible" });
        const [commitment] = await db
          .select({
            id: linkedCommitments.id,
            processId: linkedCommitments.processId,
            sourceType: linkedCommitments.sourceType,
            sourceId: linkedCommitments.sourceId,
          })
          .from(linkedCommitments)
          .where(
            and(
              eq(linkedCommitments.id, linkedCommitmentId),
              eq(linkedCommitments.companyId, companyId)
            )
          )
          .limit(1);
        if (!commitment) {
          return res
            .status(404)
            .json({ ok: false, error: "Compromiso no encontrado" });
        }
        if (
          auth.processLeader &&
          auth.processLeader.processId !== commitment.processId
        ) {
          return res
            .status(403)
            .json({
              ok: false,
              error:
                "Solo puede adjuntar evidencia a compromisos de su proceso",
            });
        }

        const fileName = safeFileName(req.file.originalname);
        const fileKey = `linked-commitments/${companyId}/${linkedCommitmentId}/${randomUUID()}-${fileName}`;
        const { url } = await storagePut(
          fileKey,
          req.file.buffer,
          req.file.mimetype
        );
        const insertResult = await db.insert(linkedCommitmentEvidence).values({
          linkedCommitmentId,
          companyId,
          fileName,
          fileKey,
          fileUrl: url,
          mimeType: req.file.mimetype,
          fileSizeBytes: req.file.size,
        });

        // El PDF de un Cumplimiento también se refleja en su origen para que el
        // Gerente pueda abrirlo desde Cumplimientos generales sin buscar el proceso.
        if (
          commitment.sourceType === "company_compliance" &&
          commitment.sourceId &&
          req.file.mimetype === "application/pdf"
        ) {
          await db
            .update(companyCompliances)
            .set({
              evidencePdfUrl: url,
              evidencePdfName: fileName,
              evidencePdfKey: fileKey,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(companyCompliances.id, commitment.sourceId),
                eq(companyCompliances.companyId, companyId)
              )
            );
        }
        return res.status(201).json({
          ok: true,
          id: Number(insertResult[0].insertId),
          fileName,
          url,
        });
      } catch (error) {
        console.error("[linked-commitment-evidence] Error:", error);
        return res
          .status(500)
          .json({ ok: false, error: "No fue posible subir la evidencia" });
      }
    }
  );
}
