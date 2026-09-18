import type { Express, Request, Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import {
  linkedCommitments,
  meetingAgreementEvidence,
  meetingAgreements,
  meetingFiles,
  processMeetings,
} from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";
import { resolveAuthFromRequest } from "./_core/resolveRequestAuth";

const MAX_MEETING_FILE_BYTES = 50 * 1024 * 1024;
const MEETING_FILE_MIME_TYPES = new Set([
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
  limits: { fileSize: MAX_MEETING_FILE_BYTES },
});

function positiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeFileName(fileName: string): string {
  const normalized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return normalized || "archivo";
}

function hasCompanyAccess(
  auth: Awaited<ReturnType<typeof resolveAuthFromRequest>>,
  companyId: number
): boolean {
  if (auth.user?.role === "admin") return true;
  return (auth.manager?.companyId ?? auth.processLeader?.companyId) === companyId;
}

function canManageProcess(
  auth: Awaited<ReturnType<typeof resolveAuthFromRequest>>,
  processId: number
): boolean {
  return !auth.processLeader || auth.processLeader.processId === processId;
}

function uploadError(res: Response, error: unknown, label: string) {
  console.error(`[${label}] Error:`, error);
  return res
    .status(500)
    .json({ ok: false, error: "No fue posible subir el archivo." });
}

export function registerMeetingUploadRoutes(app: Express) {
  app.post(
    "/api/upload/meeting-file",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const auth = await resolveAuthFromRequest(req);
        if (!auth.user && !auth.manager && !auth.processLeader) {
          return res.status(401).json({ ok: false, error: "No autenticado" });
        }
        const companyId = positiveId(req.body.companyId);
        const meetingId = positiveId(req.body.meetingId);
        if (!companyId || !meetingId) {
          return res.status(400).json({ ok: false, error: "Datos de carga inválidos" });
        }
        if (!hasCompanyAccess(auth, companyId)) {
          return res.status(403).json({ ok: false, error: "No tiene acceso a esta empresa" });
        }
        if (!req.file) {
          return res.status(400).json({ ok: false, error: "No se recibió ningún archivo" });
        }
        if (!MEETING_FILE_MIME_TYPES.has(req.file.mimetype)) {
          return res.status(400).json({
            ok: false,
            error: "Solo se permiten archivos PDF, imagen, Word o Excel",
          });
        }
        const db = await getDb();
        if (!db) {
          return res.status(503).json({ ok: false, error: "Base de datos no disponible" });
        }
        const [meeting] = await db
          .select({
            id: processMeetings.id,
            processId: processMeetings.processId,
            status: processMeetings.status,
          })
          .from(processMeetings)
          .where(
            and(
              eq(processMeetings.id, meetingId),
              eq(processMeetings.companyId, companyId)
            )
          )
          .limit(1);
        if (!meeting) {
          return res.status(404).json({ ok: false, error: "Reunión no encontrada" });
        }
        if (meeting.status === "annulled") {
          return res.status(400).json({
            ok: false,
            error: "No puede adjuntar archivos a una reunión anulada",
          });
        }
        if (!canManageProcess(auth, meeting.processId)) {
          return res.status(403).json({
            ok: false,
            error: "Solo puede adjuntar archivos a reuniones de su proceso",
          });
        }
        const fileName = safeFileName(req.file.originalname);
        const fileKey = `meetings/${companyId}/${meetingId}/files/${randomUUID()}-${fileName}`;
        const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
        const result = await db.insert(meetingFiles).values({
          meetingId,
          companyId,
          fileName,
          fileKey,
          fileUrl: url,
          mimeType: req.file.mimetype,
          fileSizeBytes: req.file.size,
        });
        return res.status(201).json({
          ok: true,
          id: Number(result[0].insertId),
          fileName,
          url,
        });
      } catch (error) {
        return uploadError(res, error, "meeting-file");
      }
    }
  );

  app.post(
    "/api/upload/meeting-agreement-evidence",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const auth = await resolveAuthFromRequest(req);
        if (!auth.user && !auth.manager && !auth.processLeader) {
          return res.status(401).json({ ok: false, error: "No autenticado" });
        }
        const companyId = positiveId(req.body.companyId);
        const agreementId = positiveId(req.body.agreementId);
        if (!companyId || !agreementId) {
          return res.status(400).json({ ok: false, error: "Datos de carga inválidos" });
        }
        if (!hasCompanyAccess(auth, companyId)) {
          return res.status(403).json({ ok: false, error: "No tiene acceso a esta empresa" });
        }
        if (!req.file) {
          return res.status(400).json({ ok: false, error: "No se recibió ningún archivo" });
        }
        if (!MEETING_FILE_MIME_TYPES.has(req.file.mimetype)) {
          return res.status(400).json({
            ok: false,
            error: "Solo se permiten evidencias PDF, imagen, Word o Excel",
          });
        }
        const db = await getDb();
        if (!db) {
          return res.status(503).json({ ok: false, error: "Base de datos no disponible" });
        }
        const [agreement] = await db
          .select({
            id: meetingAgreements.id,
            meetingId: meetingAgreements.meetingId,
            processId: meetingAgreements.processId,
            targetProcessId: meetingAgreements.targetProcessId,
          })
          .from(meetingAgreements)
          .where(
            and(
              eq(meetingAgreements.id, agreementId),
              eq(meetingAgreements.companyId, companyId)
            )
          )
          .limit(1);
        if (!agreement) {
          return res.status(404).json({ ok: false, error: "Acuerdo no encontrado" });
        }
        const [meeting] = await db
          .select({ status: processMeetings.status })
          .from(processMeetings)
          .where(
            and(
              eq(processMeetings.id, agreement.meetingId),
              eq(processMeetings.companyId, companyId)
            )
          )
          .limit(1);
        if (!meeting || meeting.status === "annulled") {
          return res.status(400).json({
            ok: false,
            error: "No puede adjuntar evidencia a un acuerdo de una reunión anulada",
          });
        }
        if (!canManageProcess(auth, agreement.processId)) {
          return res.status(403).json({
            ok: false,
            error: "Solo puede adjuntar evidencia a acuerdos de su proceso",
          });
        }
        const [linked] = await db
          .select({ id: linkedCommitments.id })
          .from(linkedCommitments)
          .where(
            and(
              eq(linkedCommitments.companyId, companyId),
              eq(linkedCommitments.sourceType, "meeting_agreement"),
              eq(linkedCommitments.sourceId, agreement.id),
              eq(linkedCommitments.sourceSubId, agreement.meetingId)
            )
          )
          .limit(1);
        if (linked) {
          return res.status(400).json({
            ok: false,
            error: "La evidencia de este acuerdo vinculado debe subirse desde Compromisos vinculados del proceso responsable",
          });
        }
        const fileName = safeFileName(req.file.originalname);
        const fileKey = `meetings/${companyId}/${agreement.meetingId}/agreements/${agreementId}/${randomUUID()}-${fileName}`;
        const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
        const result = await db.insert(meetingAgreementEvidence).values({
          meetingAgreementId: agreementId,
          companyId,
          fileName,
          fileKey,
          fileUrl: url,
          mimeType: req.file.mimetype,
          fileSizeBytes: req.file.size,
        });
        return res.status(201).json({
          ok: true,
          id: Number(result[0].insertId),
          fileName,
          url,
        });
      } catch (error) {
        return uploadError(res, error, "meeting-agreement-evidence");
      }
    }
  );
}
