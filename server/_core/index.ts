import "./loadEnv";
import express from "express";
import { createServer } from "http";
import path from "path";

import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes, validateOAuthConfig } from "./oauth";
import { registerAuthSessionRoutes } from "./authSessionHttpRoutes";
import { registerFileUploadRoutes } from "./fileUploadRoutes";
import { registerPublicApiRoutes } from "./publicApiRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerScheduleAlertsCron } from "../lib/scheduleAlerts";
import { registerStrategicSnapshotsCron } from "../lib/strategicSnapshots";

async function startServer() {
  // Validate OAuth configuration before starting server
  try {
    await validateOAuthConfig();
  } catch (error) {
    console.error("[Server] Failed to start: OAuth configuration is invalid");
    process.exit(1);
  }

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));
  if (process.env.NODE_ENV !== "production") {
    app.use(
      "/local-storage",
      express.static(path.join(process.cwd(), ".local-storage"), {
        fallthrough: false,
      })
    );
  }
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  registerAuthSessionRoutes(app);
  registerFileUploadRoutes(app);
  registerPublicApiRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "3000");

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
    registerScheduleAlertsCron();
    registerStrategicSnapshotsCron();
  });
}

startServer().catch(console.error);
