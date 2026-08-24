import type { Express, Request, Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { managementSystemFiles, managementSystems } from "../drizzle/schema";
import { storagePut } from "./storage";
import { resolveAuthFromRequest } from "./_core/resolveRequestAuth";

const MAX_MANAGEMENT_SYSTEM_FILE_BYTES = 50 * 1024 * 1024;
const MANAGEMENT_SYSTEM_FILE_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MANAGEMENT_SYSTEM_FILE_BYTES },
});

function getPositiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function mayAccessCompany(
  auth: Awaited<ReturnType<typeof resolveAuthFromRequest>>,
  companyId: number,
): boolean {
  // El Administrador de plataforma puede trabajar con la empresa que seleccionó.
  if (auth.user) return true;
  const roleCompanyId = auth.manager?.companyId ?? auth.processLeader?.companyId;
  return roleCompanyId === companyId;
}

export function registerManagementSystemUploadRoutes(app: Express) {
  app.post(
    "/api/upload/management-system-file",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const auth = await resolveAuthFromRequest(req);
        if (!auth.user && !auth.manager && !auth.processLeader) {
          return res.status(401).json({ ok: false, error: "No autenticado" });
        }

        const companyId = getPositiveId(req.body.companyId);
        const managementSystemId = getPositiveId(req.body.managementSystemId);
        const fileType = req.body.fileType === "certification" || req.body.fileType === "checklist"
          ? req.body.fileType
          : null;

        if (!companyId || !managementSystemId || !fileType) {
          return res.status(400).json({ ok: false, error: "Datos de carga inválidos" });
        }
        if (!mayAccessCompany(auth, companyId)) {
          return res.status(403).json({ ok: false, error: "No tiene acceso a esta empresa" });
        }
        if (!req.file) {
          return res.status(400).json({ ok: false, error: "No se recibió ningún archivo" });
        }
        if (!MANAGEMENT_SYSTEM_FILE_MIME_TYPES.has(req.file.mimetype)) {
          return res.status(400).json({ ok: false, error: "Solo se permiten archivos PDF o Excel" });
        }

        const db = await getDb();
        if (!db) return res.status(503).json({ ok: false, error: "Base de datos no disponible" });

        const [managementSystem] = await db
          .select({ id: managementSystems.id })
          .from(managementSystems)
          .where(and(
            eq(managementSystems.id, managementSystemId),
            eq(managementSystems.companyId, companyId),
          ));
        if (!managementSystem) {
          return res.status(404).json({ ok: false, error: "Sistema de gestión no encontrado" });
        }

        const fileKey = `audits/${companyId}/management/${managementSystemId}/${fileType}/${randomUUID()}-${safeFileName(req.file.originalname)}`;
        const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
        const insertResult = await db.insert(managementSystemFiles).values({
          managementSystemId,
          companyId,
          fileType,
          fileName: req.file.originalname,
          fileUrl: url,
          fileKey,
        });

        return res.status(201).json({
          ok: true,
          id: Number(insertResult[0].insertId),
          fileName: req.file.originalname,
          url,
        });
      } catch (error) {
        console.error("[management-system-file] Error:", error);
        return res.status(500).json({ ok: false, error: "No fue posible subir el archivo" });
      }
    },
  );
}
