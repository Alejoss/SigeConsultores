export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Forge API (legacy — used by LLM, notifications, voice, etc.)
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // S3 storage (shared bucket with backups — uploads go under "uploads/" prefix)
  // Accepts both AWS_* (production) and S3_* (staging/local MinIO) variable names
  s3Bucket: process.env.AWS_S3_BUCKET ?? process.env.S3_BUCKET ?? "sige-backups",
  s3Region: process.env.AWS_S3_REGION ?? process.env.AWS_REGION ?? process.env.S3_REGION ?? "us-east-2",
  s3AccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY ?? "",
  s3SecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_KEY ?? "",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  // Public-facing endpoint for presigned download URLs (may differ from internal endpoint)
  s3PublicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT ?? "",
  // Frontend URL for invitation links
  frontendUrl: process.env.FRONTEND_URL ?? process.env.VITE_FRONTEND_URL ?? "http://localhost:3000",
  // AWS SES — transactional email. Region is independent of S3 (typically Ohio).
  // Prefer SES_* keys so the dedicated IAM user is not mixed with S3 credentials.
  sesRegion: process.env.AWS_SES_REGION ?? process.env.AWS_REGION ?? "us-west-2",
  sesAccessKeyId: process.env.SES_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? "",
  sesSecretAccessKey: process.env.SES_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? "",
  sesFromEmail: process.env.SES_FROM_EMAIL ?? "",
  sesFromName: process.env.SES_FROM_NAME ?? "ISGE 360",
};
