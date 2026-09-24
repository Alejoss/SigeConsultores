/**
 * Canonical inventory for production env on GitHub Actions + droplet.
 *
 * Non-sensitive values are baked in `productionDefaults` so CD does not require
 * dozens of GitHub Actions Variables. Override any key via `vars.*` / env if needed.
 *
 * Operators only maintain GitHub **Secrets** (passwords, keys, tokens).
 *
 * APP_IMAGE is injected by the workflow (never store it in GitHub).
 */

/** @typedef {{ key: string, required?: boolean, description?: string }} EnvKey */

/**
 * Baked production defaults (safe to commit — no passwords or private keys).
 * Keep in sync with public ISGE 360 production.
 */
export const productionDefaults = {
  DROPLET_HOST: "167.172.127.47",
  DROPLET_USER: "root",
  DEPLOY_PATH: "/opt/sige-app-staging",
  GHCR_USERNAME: "Alejoss",
  FRONTEND_URL: "https://isge360.com",
  VITE_FRONTEND_URL: "https://isge360.com",
  AWS_SES_REGION: "us-west-2",
  SES_FROM_EMAIL: "noreply@isge360.com",
  SES_FROM_NAME: "ISGE 360",
  AWS_S3_REGION: "us-east-2",
  AWS_S3_BUCKET: "sige-backups",
  MYSQL_DATABASE: "sige_platform_staging",
  MYSQL_USER: "sige",
  VITE_APP_ID: "proj_abc123def456",
  VITE_OAUTH_PORTAL_URL: "https://vida.butterfly-effect.dev",
  OAUTH_SERVER_URL: "https://vidabiz.butterfly-effect.dev",
  PORT: "3000",
};

/** @type {EnvKey[]} */
export const githubVariables = [
  { key: "DROPLET_HOST", required: false, description: "Optional override of baked default" },
  { key: "DROPLET_USER", required: false },
  { key: "DEPLOY_PATH", required: false },
  { key: "GHCR_USERNAME", required: false },
  { key: "FRONTEND_URL", required: false },
  { key: "VITE_FRONTEND_URL", required: false },
  { key: "AWS_SES_REGION", required: false },
  { key: "SES_FROM_EMAIL", required: false },
  { key: "SES_FROM_NAME", required: false },
  { key: "AWS_S3_REGION", required: false },
  { key: "AWS_S3_BUCKET", required: false },
  { key: "MYSQL_DATABASE", required: false },
  { key: "MYSQL_USER", required: false },
  { key: "VITE_APP_ID", required: false },
  { key: "VITE_OAUTH_PORTAL_URL", required: false },
  { key: "OAUTH_SERVER_URL", required: false },
  { key: "PORT", required: false },
];

/** Only these must exist as GitHub Actions repository secrets. */
/** @type {EnvKey[]} */
export const githubSecrets = [
  { key: "DROPLET_SSH_KEY", required: true, description: "Private SSH key for the droplet" },
  { key: "GHCR_TOKEN", required: true, description: "PAT with read:packages + repo" },
  { key: "MYSQL_ROOT_PASSWORD", required: true },
  { key: "MYSQL_PASSWORD", required: true },
  { key: "JWT_SECRET", required: true },
  { key: "OWNER_OPEN_ID", required: false },
  { key: "AWS_ACCESS_KEY_ID", required: true },
  { key: "AWS_SECRET_ACCESS_KEY", required: true },
  { key: "SES_ACCESS_KEY_ID", required: true },
  { key: "SES_SECRET_ACCESS_KEY", required: true },
];

/** Keys written to `.env.production` (order kept for readable diffs). */
export const envFileKeys = [
  "GHCR_USERNAME",
  "GHCR_TOKEN",
  "MYSQL_ROOT_PASSWORD",
  "MYSQL_DATABASE",
  "MYSQL_USER",
  "MYSQL_PASSWORD",
  "VITE_APP_ID",
  "VITE_OAUTH_PORTAL_URL",
  "OAUTH_SERVER_URL",
  "JWT_SECRET",
  "OWNER_OPEN_ID",
  "FRONTEND_URL",
  "VITE_FRONTEND_URL",
  "AWS_SES_REGION",
  "SES_FROM_EMAIL",
  "SES_FROM_NAME",
  "SES_ACCESS_KEY_ID",
  "SES_SECRET_ACCESS_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_S3_REGION",
  "AWS_S3_BUCKET",
  "PORT",
];

export const deployOnlyKeys = ["DROPLET_HOST", "DROPLET_USER", "DEPLOY_PATH", "DROPLET_SSH_KEY"];

/**
 * Resolve one key: process.env wins, else baked default.
 * @param {string} key
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveEnvValue(key, env = process.env) {
  const fromEnv = env[key];
  if (fromEnv !== undefined && String(fromEnv).trim() !== "") {
    return String(fromEnv);
  }
  if (Object.prototype.hasOwnProperty.call(productionDefaults, key)) {
    return productionDefaults[key];
  }
  return "";
}

export function requiredGithubSecretKeys() {
  return githubSecrets.filter((k) => k.required !== false).map((k) => k.key);
}

export function requiredEnvFileKeys() {
  return envFileKeys.filter((key) => {
    if (Object.prototype.hasOwnProperty.call(productionDefaults, key)) {
      return false; // satisfied by bake-in
    }
    const fromSecrets = githubSecrets.find((k) => k.key === key);
    return fromSecrets ? fromSecrets.required !== false : true;
  });
}
