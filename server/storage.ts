import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { ENV } from "./_core/env";

let _client: S3Client | null = null;
let _publicClient: S3Client | null = null;

function buildClient(endpoint: string): S3Client {
  const { s3AccessKeyId, s3SecretAccessKey, s3Region } = ENV;
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

  if (endpoint) {
    clientConfig.endpoint = endpoint;
    clientConfig.forcePathStyle = true; // Required for MinIO / S3-compatible services
  }

  return new S3Client(clientConfig);
}

/** Internal client — used for upload/delete operations (uses S3_ENDPOINT) */
function getClient(): S3Client {
  if (_client) return _client;
  _client = buildClient(ENV.s3Endpoint);
  return _client;
}

/** Public client — used for presigned download URLs (uses S3_PUBLIC_ENDPOINT) */
function getPublicClient(): S3Client {
  if (_publicClient) return _publicClient;
  _publicClient = buildClient(ENV.s3PublicEndpoint);
  return _publicClient;
}

function getBucket(): string {
  const bucket = ENV.s3Bucket;
  if (!bucket) {
    throw new Error("S3 bucket not configured: set AWS_S3_BUCKET");
  }
  return bucket;
}

const UPLOAD_PREFIX = "uploads/";
const LOCAL_STORAGE_ROOT = path.join(process.cwd(), ".local-storage");

function useLocalFallback(): boolean {
  return !ENV.isProduction && (!ENV.s3AccessKeyId || !ENV.s3SecretAccessKey);
}

function localStoragePath(key: string): string {
  const resolved = path.resolve(LOCAL_STORAGE_ROOT, key);
  if (!resolved.startsWith(`${LOCAL_STORAGE_ROOT}${path.sep}`))
    throw new Error("Ruta local de almacenamiento inválida.");
  return resolved;
}

function localStorageUrl(key: string): string {
  return `/local-storage/${key.split("/").map(encodeURIComponent).join("/")}`;
}

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
  const key = normalizeKey(relKey);
  const body = typeof data === "string" ? Buffer.from(data, "utf-8") : data;

  if (useLocalFallback()) {
    const filePath = localStoragePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
    return { key, url: localStorageUrl(key) };
  }

  const client = getClient();
  const bucket = getBucket();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  const url = await getDownloadUrl(bucket, key);
  return { key, url };
}

/**
 * Get a presigned download URL for an existing S3 object.
 * Drop-in replacement for the old Forge-based storageGet.
 */
export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  if (useLocalFallback()) return { key, url: localStorageUrl(key) };

  const bucket = getBucket();
  const url = await getDownloadUrl(bucket, key);
  return { key, url };
}

/**
 * Delete an object from S3.
 */
export async function storageDelete(relKey: string): Promise<void> {
  const key = normalizeKey(relKey);
  if (useLocalFallback()) {
    try {
      await unlink(localStoragePath(key));
    } catch {
      /* archivo ya ausente */
    }
    return;
  }

  const client = getClient();
  const bucket = getBucket();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

const PRESIGNED_URL_EXPIRY = 604800; // 7 days

async function getDownloadUrl(bucket: string, key: string): Promise<string> {
  // Use the public client so presigned URLs point to the publicly-accessible endpoint
  const publicClient = getPublicClient();
  return getSignedUrl(
    publicClient,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: PRESIGNED_URL_EXPIRY }
  );
}
