import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { revokeAuthSessionByPlainToken } from "../authSessionRepository";
import { getDb } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { resolveAuthFromRequest } from "./resolveRequestAuth";
import { completeUnifiedLoginSession, tryUnifiedLogin } from "./unifiedLogin";
import {
  getManagerContext,
  getPlatformUserShape,
  getProcessLeaderContext,
  getProcessLeaderContextForProcess,
} from "../accountAuth";

/** Login unificado: correo + contraseña contra `accounts`; tipo de sesión según `account_roles`. */
const unifiedLoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Contraseña requerida"),
  /** Si se envía, limita el login unificado al jefe de proceso de ese proceso. */
  processId: z.coerce.number().int().positive().optional(),
});

function readSessionCookie(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const c = parseCookieHeader(raw)[COOKIE_NAME];
  return typeof c === "string" && c.length > 0 ? c : null;
}

export function registerAuthSessionRoutes(app: Express) {
  app.post("/api/auth/session/login", async (req: Request, res: Response) => {
    try {
      const parsed = unifiedLoginBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "Solicitud inválida" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(503).json({ ok: false, error: "Database not available" });
      }

      const { email, password, processId } = parsed.data;
      const outcome = await tryUnifiedLogin(db, email, password, processId);
      if (!("accountId" in outcome)) {
        return res.status(outcome.status).json({ ok: false, error: outcome.error });
      }

      const { plainToken } = await completeUnifiedLoginSession(outcome);

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, plainToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      if (processId != null) {
        const pl = await getProcessLeaderContextForProcess(db, outcome.accountId, processId);
        if (!pl) {
          res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
          await revokeAuthSessionByPlainToken(plainToken);
          return res.status(403).json({
            ok: false as const,
            error: "La cuenta no es jefe de proceso de este proceso",
          });
        }
        return res.json({
          ok: true as const,
          kind: "process_leader" as const,
          processLeaderId: pl.processLeaderId,
          leaderName: pl.leaderName,
          leaderEmail: pl.leaderEmail,
          processId: pl.processId,
          companyId: pl.companyId,
          companyName: pl.companyName,
        });
      }

      const platformUser = await getPlatformUserShape(db, outcome.accountId);
      if (platformUser) {
        return res.json({
          ok: true as const,
          kind: "platform_user" as const,
          user: {
            id: platformUser.id,
            email: platformUser.email,
            name: platformUser.name,
            role: platformUser.role,
          },
        });
      }
      const manager = await getManagerContext(db, outcome.accountId);
      if (manager) {
        return res.json({
          ok: true as const,
          kind: "company_manager" as const,
          companyId: manager.companyId,
          companyName: manager.companyName,
          managerEmail: manager.managerEmail,
        });
      }
      const processLeader = await getProcessLeaderContext(db, outcome.accountId);
      if (processLeader) {
        return res.json({
          ok: true as const,
          kind: "process_leader" as const,
          processLeaderId: processLeader.processLeaderId,
          leaderName: processLeader.leaderName,
          leaderEmail: processLeader.leaderEmail,
          processId: processLeader.processId,
          companyId: processLeader.companyId,
          companyName: processLeader.companyName,
        });
      }

      return res.status(403).json({
        ok: false as const,
        error: "La cuenta no tiene un rol de plataforma, gerente o jefe de proceso asignado",
      });
    } catch (e) {
      console.error("[auth/session/login]", e);
      return res.status(500).json({ ok: false, error: "Error interno" });
    }
  });

  app.post("/api/auth/session/logout", async (req: Request, res: Response) => {
    const plain = readSessionCookie(req);
    if (plain) {
      await revokeAuthSessionByPlainToken(plain);
    }
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return res.json({ ok: true });
  });

  app.get("/api/auth/session/me", async (req: Request, res: Response) => {
    try {
      const { user, manager, processLeader } = await resolveAuthFromRequest(req);
      if (user) {
        return res.json({
          authenticated: true as const,
          kind: "platform_user" as const,
          user: {
            id: user.id,
            email: user.email ?? null,
            name: user.name ?? null,
            role: user.role,
          },
        });
      }
      if (manager) {
        return res.json({
          authenticated: true as const,
          kind: "company_manager" as const,
          companyId: manager.companyId,
          companyName: manager.companyName,
          managerEmail: manager.managerEmail,
        });
      }
      if (processLeader) {
        return res.json({
          authenticated: true as const,
          kind: "process_leader" as const,
          processLeaderId: processLeader.processLeaderId,
          leaderName: processLeader.leaderName,
          leaderEmail: processLeader.leaderEmail,
          processId: processLeader.processId,
          companyId: processLeader.companyId,
          companyName: processLeader.companyName,
        });
      }
      return res.json({ authenticated: false as const });
    } catch (e) {
      console.error("[auth/session/me]", e);
      return res.status(500).json({ authenticated: false as const });
    }
  });
}
