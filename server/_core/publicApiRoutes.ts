/**
 * Rutas públicas de API para integración con herramientas externas (Power BI, Excel, etc.)
 * No requieren autenticación — el companyId actúa como token de acceso.
 */
import { Express, Request, Response } from "express";
import { getDb } from "../db";
import { companyTrends } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export function registerPublicApiRoutes(app: Express) {
  /**
   * GET /api/public/strategic-trends/:companyId
   * Devuelve el historial de tendencias estratégicas en JSON para Power BI.
   * Incluye OTE, OTG, GPI con sus metas y valores reales por mes/año.
   */
  app.get("/api/public/strategic-trends/:companyId", async (req: Request, res: Response) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (isNaN(companyId) || companyId <= 0) {
        return res.status(400).json({ error: "companyId inválido" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(503).json({ error: "Base de datos no disponible" });
      }

      const rows = await db
        .select()
        .from(companyTrends)
        .where(eq(companyTrends.companyId, companyId))
        .orderBy(companyTrends.year, companyTrends.month);

      const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

      const data = rows.map((r: any) => ({
        año: r.year,
        mes: r.month,
        periodo: `${MONTHS[r.month - 1]} ${r.year}`,
        ote_avance: parseFloat(r.otePercent) || 0,
        ote_meta: parseFloat(r.oteMeta) || 100,
        otg_avance: parseFloat(r.otgPercent) || 0,
        otg_meta: parseFloat(r.otgMeta) || 100,
        gpi_avance: parseFloat(r.stakeholderPercent) || 0,
        gpi_meta: parseFloat(r.stakeholderMeta) || 100,
      }));

      // Cabeceras CORS para permitir acceso desde Power BI
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Content-Type", "application/json; charset=utf-8");

      return res.json({
        fuente: "SIGE Platform — Tendencias Estratégicas",
        empresa_id: companyId,
        total_registros: data.length,
        ultima_actualizacion: new Date().toISOString(),
        datos: data,
      });
    } catch (err) {
      console.error("[PublicAPI] Error en strategic-trends:", err);
      return res.status(500).json({ error: "Error interno del servidor" });
    }
  });

  // Preflight CORS
  app.options("/api/public/strategic-trends/:companyId", (_req: Request, res: Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.sendStatus(200);
  });
}
