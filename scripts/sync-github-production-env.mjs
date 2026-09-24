#!/usr/bin/env node
/**
 * One-time (or periodic) sync: local `.env.production` → GitHub Actions
 * repository Variables + Secrets, using the canonical manifest.
 *
 * Prerequisites: `gh` CLI authenticated with admin rights on the repo.
 *
 * Usage:
 *   # Dry-run (prints what would be set; never prints secret values)
 *   node scripts/sync-github-production-env.mjs path/to/.env.production --dry-run
 *
 *   # Apply
 *   node scripts/sync-github-production-env.mjs path/to/.env.production
 *
 * Deploy-only keys (DROPLET_HOST, …) are optional in the dotenv file; pass them
 * via existing GitHub config or set them once manually / with --set-deploy-from-env.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  githubVariables,
  githubSecrets,
  deployOnlyKeys,
} from "./productionEnvManifest.mjs";

function usage() {
  console.log(`Usage: node scripts/sync-github-production-env.mjs <dotenv-file> [--dry-run] [--repo owner/name]

Reads KEY=value pairs and upserts:
  - non-sensitive keys → gh variable set
  - sensitive keys     → gh secret set

Does not print secret values. Skips APP_IMAGE and unknown keys.`);
}

function parseDotenv(contents) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function runGh(args, { input, dryRun }) {
  const pretty = `gh ${args.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`;
  if (dryRun) {
    console.log(`[dry-run] ${pretty}`);
    return { status: 0 };
  }
  const result = spawnSync("gh", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || `gh failed: ${pretty}`);
    process.exit(result.status ?? 1);
  }
  return result;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    usage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const dryRun = args.includes("--dry-run");
  const repoIdx = args.indexOf("--repo");
  const repo = repoIdx >= 0 ? args[repoIdx + 1] : null;
  const file = args.find((a) => !a.startsWith("--") && a !== repo);
  if (!file) {
    usage();
    process.exit(1);
  }

  const envMap = parseDotenv(readFileSync(file, "utf8"));
  const varKeys = new Set(githubVariables.map((k) => k.key));
  const secretKeys = new Set(githubSecrets.map((k) => k.key));
  const deploySet = new Set(deployOnlyKeys);

  const repoArgs = repo ? ["--repo", repo] : [];

  /** @type {string[]} */
  const missingVars = [];
  /** @type {string[]} */
  const missingSecrets = [];
  /** @type {string[]} */
  const skippedUnknown = [];

  for (const key of Object.keys(envMap)) {
    if (key === "APP_IMAGE" || key === "DATABASE_URL" || key === "NODE_ENV") {
      continue;
    }
    if (deploySet.has(key)) {
      // Optional: sync deploy keys if present in the file (unusual).
    } else if (!varKeys.has(key) && !secretKeys.has(key)) {
      skippedUnknown.push(key);
    }
  }

  for (const { key, required } of githubVariables) {
    if (deploySet.has(key)) {
      // Deploy infra: keep existing GitHub values unless present in dotenv.
      if (!(key in envMap) || !String(envMap[key]).trim()) {
        if (required !== false) {
          console.log(
            `[skip] variable ${key} not in dotenv (set once in GitHub Variables if missing)`,
          );
        }
        continue;
      }
    } else if (!(key in envMap) || !String(envMap[key]).trim()) {
      if (required !== false) missingVars.push(key);
      continue;
    }

    const value = envMap[key];
    console.log(`[variable] set ${key} (length ${value.length})`);
    runGh(["variable", "set", key, ...repoArgs, "--body", value], { dryRun });
  }

  for (const { key, required } of githubSecrets) {
    if (key === "DROPLET_SSH_KEY") {
      console.log(
        `[skip] secret ${key} — keep the existing GitHub secret (not taken from dotenv)`,
      );
      continue;
    }
    if (!(key in envMap) || !String(envMap[key]).trim()) {
      if (required !== false) missingSecrets.push(key);
      continue;
    }
    const value = envMap[key];
    console.log(`[secret] set ${key} (length ${value.length})`);
    runGh(["secret", "set", key, ...repoArgs], { input: value, dryRun });
  }

  if (skippedUnknown.length) {
    console.log(
      `[info] ignored unknown dotenv keys: ${skippedUnknown.sort().join(", ")}`,
    );
  }

  if (missingVars.length || missingSecrets.length) {
    console.error("\n[error] Required keys missing from dotenv:");
    if (missingVars.length) {
      console.error(`  variables: ${missingVars.join(", ")}`);
    }
    if (missingSecrets.length) {
      console.error(`  secrets: ${missingSecrets.join(", ")}`);
    }
    process.exit(1);
  }

  console.log(
    dryRun
      ? "\nDry-run complete. Re-run without --dry-run to apply."
      : "\nGitHub Variables and Secrets updated from dotenv.",
  );
  console.log(
    "Next: remove obsolete ENV_PRODUCTION secret after CD uses the new workflow.",
  );
}

main();
