import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

const root = path.dirname(fileURLToPath(import.meta.url));
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

function ensureDatabaseUrlFromMysql(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  const user = process.env.MYSQL_USER?.trim();
  const pass = process.env.MYSQL_PASSWORD ?? "";
  const database = process.env.MYSQL_DATABASE?.trim();
  if (!user || !database) return;
  const host = process.env.MYSQL_HOST?.trim() || "127.0.0.1";
  const port = process.env.MYSQL_PORT?.trim() || "3306";
  process.env.DATABASE_URL = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${database}`;
}

ensureDatabaseUrlFromMysql();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL o (MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE) son requeridos para drizzle-kit"
  );
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
