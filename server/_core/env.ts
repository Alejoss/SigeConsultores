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
  // Frontend URL for invitation links
  frontendUrl: process.env.FRONTEND_URL ?? process.env.VITE_FRONTEND_URL ?? "http://localhost:3000",
  // AWS SES Configuration (deprecated - use Brevo instead)
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  awsRegion: process.env.AWS_REGION ?? "us-east-1",
  sesFromEmail: process.env.SES_FROM_EMAIL ?? "noreply@sige.platform",
  // Brevo transactional API — key from https://app.brevo.com/settings/keys/api
  brevoApiKey: process.env.BREVO_API_KEY ?? "",
  brevoFromEmail: process.env.BREVO_FROM_EMAIL ?? "",
  brevoFromName: process.env.BREVO_FROM_NAME ?? "SIGE Consultores",
};
