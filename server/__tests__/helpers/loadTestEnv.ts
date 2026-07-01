import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

/** Load `.env` then `.env.local` (same order as drizzle.config.ts). */
export function loadTestEnv(rootDir: string): void {
  for (const file of [".env", ".env.local"]) {
    const envPath = path.join(rootDir, file);
    if (existsSync(envPath)) {
      loadEnv({ path: envPath, override: true });
    }
  }
}
