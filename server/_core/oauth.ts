import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import { createAuthSession } from "../authSessionRepository";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Retry configuration for OAuth operations
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Retry logic with exponential backoff
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries = RETRY_CONFIG.maxRetries
): Promise<T> {
  let lastError: Error | null = null;
  let delayMs = RETRY_CONFIG.initialDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[OAuth] ${operationName} - Attempt ${attempt}/${maxRetries}`);
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.warn(
        `[OAuth] ${operationName} failed on attempt ${attempt}:`,
        lastError.message
      );

      if (attempt < maxRetries) {
        console.log(`[OAuth] Retrying ${operationName} in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs = Math.min(delayMs * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
      }
    }
  }

  throw new Error(
    `${operationName} failed after ${maxRetries} attempts: ${lastError?.message}`
  );
}

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Validate OAuth configuration on startup
 */
export async function validateOAuthConfig(): Promise<void> {
  try {
    console.log("[OAuth] Validating OAuth configuration...");
    
    const requiredEnvs = ["VITE_APP_ID", "OAUTH_SERVER_URL", "JWT_SECRET"];
    const missing = requiredEnvs.filter((env) => !process.env[env]);

    if (missing.length > 0) {
      throw new Error(`Missing required OAuth environment variables: ${missing.join(", ")}`);
    }

    console.log("[OAuth] ✅ OAuth configuration is valid");
  } catch (error) {
    console.error("[OAuth] ❌ OAuth configuration validation failed:", error);
    throw error;
  }
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const requestId = Math.random().toString(36).substring(7);

    console.log(`[OAuth] [${requestId}] Callback received - code: ${code?.substring(0, 10)}..., state: ${state?.substring(0, 10)}...`);

    if (!code || !state) {
      console.warn(`[OAuth] [${requestId}] Missing code or state`);
      return res.status(400).json({
        error: "code and state are required",
        requestId,
      });
    }

    try {
      // Exchange code for token with retries
      const tokenResponse = await retryWithBackoff(
        () => sdk.exchangeCodeForToken(code, state),
        `exchangeCodeForToken [${requestId}]`,
        RETRY_CONFIG.maxRetries
      );

      console.log(`[OAuth] [${requestId}] Token exchange successful`);

      // Get user info with retries
      const userInfo = await retryWithBackoff(
        () => sdk.getUserInfo(tokenResponse.accessToken),
        `getUserInfo [${requestId}]`,
        RETRY_CONFIG.maxRetries
      );

      console.log(`[OAuth] [${requestId}] User info retrieved - openId: ${userInfo.openId?.substring(0, 10)}...`);

      if (!userInfo.openId) {
        console.error(`[OAuth] [${requestId}] openId missing from user info`);
        return res.status(400).json({
          error: "openId missing from user info",
          requestId,
        });
      }

      // Upsert user with error handling
      try {
        await db.upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: new Date(),
        });
        console.log(`[OAuth] [${requestId}] User upserted successfully`);
      } catch (dbError) {
        console.error(`[OAuth] [${requestId}] Database error during upsert:`, dbError);
        throw new Error(`Failed to save user to database: ${(dbError as Error).message}`);
      }

      const userRow = await db.getUserByOpenId(userInfo.openId);
      if (!userRow?.id) {
        console.error(`[OAuth] [${requestId}] User row missing after upsert`);
        return res.status(500).json({
          error: "User persistence failed",
          requestId,
        });
      }

      const { plainToken } = await createAuthSession({
        accountId: userRow.id,
      });

      console.log(`[OAuth] [${requestId}] DB session created for account id ${userRow.id}`);

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, plainToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      console.log(`[OAuth] [${requestId}] ✅ OAuth callback completed successfully`);
      res.redirect(302, "/dashboard");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = error instanceof Error ? error.constructor.name : "Unknown";

      console.error(`[OAuth] [${requestId}] ❌ Callback failed:`, {
        errorType,
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Return error page instead of JSON for better UX
      const errorHtml = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Error de Autenticación - ISGE 360</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              border-radius: 8px;
              box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
              padding: 40px;
              max-width: 500px;
              text-align: center;
            }
            h1 {
              color: #d32f2f;
              margin: 0 0 10px 0;
              font-size: 24px;
            }
            p {
              color: #666;
              line-height: 1.6;
              margin: 10px 0;
            }
            .error-details {
              background: #f5f5f5;
              border-left: 4px solid #d32f2f;
              padding: 15px;
              margin: 20px 0;
              text-align: left;
              border-radius: 4px;
              font-family: monospace;
              font-size: 12px;
              color: #333;
              max-height: 150px;
              overflow-y: auto;
            }
            .request-id {
              color: #999;
              font-size: 12px;
              margin-top: 20px;
            }
            a {
              display: inline-block;
              margin-top: 20px;
              padding: 10px 20px;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 4px;
              transition: background 0.3s;
            }
            a:hover {
              background: #764ba2;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⚠️ Error de Autenticación</h1>
            <p>No pudimos completar tu inicio de sesión. Esto puede deberse a:</p>
            <ul style="text-align: left; color: #666;">
              <li>Problema temporal de conectividad</li>
              <li>Sesión expirada</li>
              <li>Credenciales inválidas</li>
            </ul>
            <div class="error-details">
              <strong>Detalles:</strong><br>
              ${errorType}: ${errorMessage}
            </div>
            <p style="color: #999; font-size: 14px;">
              Si el problema persiste, contacta al equipo de soporte.
            </p>
            <a href="/">← Volver al inicio</a>
            <div class="request-id">ID de solicitud: ${requestId}</div>
          </div>
        </body>
        </html>
      `;

      res.status(500).set("Content-Type", "text/html").send(errorHtml);
    }
  });

  // Health check endpoint for OAuth connectivity
  app.get("/api/oauth/health", async (req: Request, res: Response) => {
    try {
      console.log("[OAuth] Health check requested");

      // Verify OAuth configuration
      if (!process.env.VITE_APP_ID || !process.env.OAUTH_SERVER_URL) {
        return res.status(503).json({
          status: "unhealthy",
          reason: "OAuth configuration missing",
        });
      }

      // Try to reach OAuth server (simple connectivity check)
      const oauthServerUrl = process.env.OAUTH_SERVER_URL;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      try {
        const response = await fetch(`${oauthServerUrl}/health`, {
          signal: controller.signal,
        }).catch(() => null);

        clearTimeout(timeoutId);

        if (response && response.ok) {
          return res.status(200).json({
            status: "healthy",
            oauthServer: "reachable",
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        clearTimeout(timeoutId);
      }

      // OAuth server not reachable, but service is still operational
      return res.status(200).json({
        status: "degraded",
        reason: "OAuth server not immediately reachable",
        note: "Service will retry automatically on login attempts",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[OAuth] Health check failed:", error);
      res.status(500).json({
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
