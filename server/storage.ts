import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;

  const { s3AccessKeyId, s3SecretAccessKey, s3Region, s3Endpoint } = ENV;
  if (!s3AccessKeyId || !s3SecretAccessKey) {
    throw new Error(
      "AWS credentials missing: set AWS_ACCESS_KEY_ID / S3_ACCESS_KEY and AWS_SECRET_ACCESS_KEY / S3_SECRET_KEY"
    );
  }

  const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
    region: s3Region,
    credentials: {
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey,
    },
  };

  // Use custom endpoint for local MinIO or other S3-compatible services
  if (s3Endpoint) {
    clientConfig.endpoint = s3Endpoint;
    clientConfig.forcePathStyle = true; // Required for MinIO
  }

  _client = new S3Client(clientConfig);
  return _client;
}

function getBucket(): string {
  const bucket = ENV.s3Bucket;
  if (!bucket) {
    throw new Error("S3 bucket not configured: set AWS_S3_BUCKET");
  }
  return bucket;
}

const UPLOAD_PREFIX = "uploads/";

function normalizeKey(relKey: string): string {
  const clean = relKey.replace(/^\/+/, "");
  return clean.startsWith(UPLOAD_PREFIX) ? clean : `${UPLOAD_PREFIX}${clean}`;
}

/**
 * Upload a file to S3. Returns the object key and a presigned download URL.
 * Drop-in replacement for the old Forge-based storagePut.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const client = getClient();
  const bucket = getBucket();
  const key = normalizeKey(relKey);

  const body =
    typeof data === "string" ? Buffer.from(data, "utf-8") : data;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  const url = await getDownloadUrl(client, bucket, key);
  return { key, url };
}

/**
 * Get a presigned download URL for an existing S3 object.
 * Drop-in replacement for the old Forge-based storageGet.
 */
export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const client = getClient();
  const bucket = getBucket();
  const key = normalizeKey(relKey);

  const url = await getDownloadUrl(client, bucket, key);
  return { key, url };
}

/**
 * Delete an object from S3.
 */
export async function storageDelete(relKey: string): Promise<void> {
  const client = getClient();
  const bucket = getBucket();
  const key = normalizeKey(relKey);

  await client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key })
  );
}

const PRESIGNED_URL_EXPIRY = 604800; // 7 days

async function getDownloadUrl(
  client: S3Client,
  bucket: string,
  key: string
): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: PRESIGNED_URL_EXPIRY }
  );
}
