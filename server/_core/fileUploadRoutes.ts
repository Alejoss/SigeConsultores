import type { Express, Request, Response } from "express";
import multer from "multer";
import { resolveAuthFromRequest } from "./resolveRequestAuth";
import { getTeamAccessHttpContext, canManageHttpProcess } from "./teamAccessHttp";
import { storagePut } from "../storage";
import { ENV } from "./env";

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
        const auth = await getTeamAccessHttpContext(req, res);
        if (!auth.user && !auth.manager && !auth.processLeader) {
          return res.status(401).json({ ok: false, error: "No autenticado" });
        }
        if (auth.user && auth.user.role !== "admin" && !auth.manager && !auth.processLeader) {
          return res.status(403).json({ ok: false, error: "No tiene acceso a la información de la empresa." });
        }

        if (auth.processLeader) {
          const processId = Number(req.body.processId);
          if (!Number.isSafeInteger(processId) || processId <= 0) {
            return res.status(400).json({ ok: false, error: "Seleccione el proceso antes de subir el archivo." });
          }
          if (!await canManageHttpProcess(auth, processId, auth.processLeader.companyId)) {
            return res.status(403).json({ ok: false, error: "Este proceso permite solo consulta o no está autorizado." });
          }
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
        const fileSizeBytes = req.file.size;

        return res.json({ ok: true, url: result.url, key: result.key, fileSizeBytes });
      } catch (error) {
        console.error("[fileUpload] Error:", error);
        return res.status(500).json({ ok: false, error: "Error al subir el archivo" });
      }
    }
  );

  /**
   * GET /api/proxy/file?url=<encoded_url>
   * Proxies a file from MinIO/S3 through the app server to avoid CORS issues.
   * Used for displaying PDFs in iframes.
   */
  app.get("/api/proxy/file", async (req: Request, res: Response) => {
    try {
      const auth = await getTeamAccessHttpContext(req, res);
      if (!auth.user && !auth.manager && !auth.processLeader) {
        return res.status(401).send("No autenticado");
      }
      if (auth.user && auth.user.role !== "admin" && !auth.manager && !auth.processLeader) {
        return res.status(403).send("No tiene acceso a la información de la empresa.");
      }
      // This generic URL-only proxy cannot prove the module/process ownership.
      // Chiefs retrieve renewed private links through record-aware tRPC guards;
      // no current client screen uses this compatibility proxy endpoint.
      if (auth.processLeader && !auth.manager && auth.user?.role !== "admin") {
        return res.status(403).send("Abra el documento desde el proceso o módulo autorizado.");
      }

      const fileUrl = req.query.url as string;
      if (!fileUrl) {
        return res.status(400).send("URL requerida");
      }

      // Only allow proxying from our own MinIO/S3 endpoint
      const allowedOrigins = [
        ENV.s3Endpoint,
        ENV.s3PublicEndpoint,
        "https://sige-backups.s3",
      ].filter(Boolean);

      const isAllowed = allowedOrigins.some((origin) => fileUrl.startsWith(origin!));
      if (!isAllowed) {
        return res.status(403).send("URL no permitida");
      }

      // If the URL uses the public endpoint, replace with internal localhost for server-side fetch
      let fetchUrl = fileUrl;
      if (ENV.s3PublicEndpoint && ENV.s3Endpoint && fileUrl.startsWith(ENV.s3PublicEndpoint)) {
        fetchUrl = fileUrl.replace(ENV.s3PublicEndpoint, ENV.s3Endpoint);
      }

      const upstream = await fetch(fetchUrl);

      if (!upstream.ok) {
        return res.status(upstream.status).send("Error al obtener el archivo");
      }

      const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
      const contentLength = upstream.headers.get("content-length");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "private, max-age=3600");
      if (contentLength) res.setHeader("Content-Length", contentLength);

      // Web API fetch returns a Web ReadableStream, not a Node.js stream.
      // Read the full buffer and send it.
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.end(buffer);
    } catch (error) {
      console.error("[proxy/file] Error:", error);
      return res.status(500).send("Error interno");
    }
  });
}
