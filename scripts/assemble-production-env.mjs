#!/usr/bin/env node
/**
 * Assemble `.env.production` from secrets (env) + baked productionDefaults.
 *
 * Usage:
 *   node scripts/assemble-production-env.mjs > .env.production
 *   node scripts/assemble-production-env.mjs --check
 */
import {
  envFileKeys,
  requiredEnvFileKeys,
  resolveEnvValue,
} from "./productionEnvManifest.mjs";

const checkOnly = process.argv.includes("--check");

function missingRequired() {
  return requiredEnvFileKeys().filter((key) => !resolveEnvValue(key).trim());
}

const missing = missingRequired();
if (missing.length) {
  console.error(
    `[assemble-production-env] Missing required secrets/env keys: ${missing.join(", ")}`,
  );
  process.exit(1);
}

if (checkOnly) {
  console.log(
    "[assemble-production-env] OK — baked defaults + required secrets are available.",
  );
  process.exit(0);
}

const lines = [];
for (const key of envFileKeys) {
  const value = resolveEnvValue(key).replace(/\r?\n/g, "");
  if (!value) continue;
  lines.push(`${key}=${value}`);
}

process.stdout.write(`${lines.join("\n")}\n`);
