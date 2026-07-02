import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

/** Repo root from source (`server/_core`) or bundled output (`dist/index.js`). */
function resolveProjectRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return startDir;
    }
    dir = parent;
  }
}

const root = resolveProjectRoot(import.meta.dirname);

const envPath = path.join(root, ".env");
const envLocalPath = path.join(root, ".env.local");

if (existsSync(envPath)) {
  config({ path: envPath });
}
if (existsSync(envLocalPath)) {
  config({ path: envLocalPath, override: true });
}
