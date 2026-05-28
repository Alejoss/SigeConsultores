import type { Express, Request, Response } from "express";
import multer from "multer";
import { resolveAuthFromRequest } from "./resolveRequestAuth";
import { storagePut } from "../storage";

// Use memory storage so we can pipe the buffer directly to S3
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB max
  },
});

export function registerFileUploadRoutes(app: Express) {
  /**
   * POST /api/upload/procedure-file
   * Accepts: multipart/form-data with field "file"
   * Returns: { url: string, key: string }
   */
  app.post(
    "/api/upload/procedure-file",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        // Authenticate via session cookie (same mechanism as tRPC)
        const auth = await resolveAuthFromRequest(req);
        if (!auth.user && !auth.manager && !auth.processLeader) {
          return res.status(401).json({ ok: false, error: "No autenticado" });
        }

        if (!req.file) {
          return res.status(400).json({ ok: false, error: "No se recibió ningún archivo" });
        }

        const userId =
          auth.user?.id ??
          auth.processLeader?.processLeaderId ??
          0;

        const safeFileName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fileKey = `procedures/${userId}/${Date.now()}-${safeFileName}`;

        const result = await storagePut(fileKey, req.file.buffer, req.file.mimetype);

        return res.json({ ok: true, url: result.url, key: result.key });
      } catch (error) {
        console.error("[fileUpload] Error:", error);
        return res.status(500).json({ ok: false, error: "Error al subir el archivo" });
      }
    }
  );
}
