/**
 * Carga de variables para herramientas CLI (admin, drizzle-kit, etc.)
 * sin repetir DATABASE_URL: basta MYSQL_* + MYSQL_HOST + MYSQL_PORT.
 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Orden: .env.staging (base staging) → .env → .env.local (gana el local).
 */
export function loadCliEnv() {
  const envStagingPath = path.join(root, ".env.staging");
  const envPath = path.join(root, ".env");
  const envLocalPath = path.join(root, ".env.local");

  if (existsSync(envStagingPath)) {
    loadEnv({ path: envStagingPath });
  }
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: true });
  }
  if (existsSync(envLocalPath)) {
    loadEnv({ path: envLocalPath, override: true });
  }

  ensureDatabaseUrl();
}

/** Si no hay DATABASE_URL pero sí MYSQL_*, construye la URL (común en staging). */
export function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return;

  const user = process.env.MYSQL_USER?.trim();
  const pass = process.env.MYSQL_PASSWORD ?? "";
  const database = process.env.MYSQL_DATABASE?.trim();
  if (!user || !database) return;

  const host = process.env.MYSQL_HOST?.trim() || "127.0.0.1";
  const port = process.env.MYSQL_PORT?.trim() || "3306";

  process.env.DATABASE_URL = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${database}`;
}
