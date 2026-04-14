import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Singleton — survive Next.js hot reloads in dev
declare global {
  var _r2: S3Client | undefined;
}

function getClient(): S3Client {
  if (globalThis._r2) return globalThis._r2;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY!,
      secretAccessKey: process.env.R2_SECRET_KEY!,
    },
  });
  if (process.env.NODE_ENV !== "production") globalThis._r2 = client;
  return client;
}

/** Generate a presigned PUT URL for direct browser → R2 upload. */
export async function presignedPut(
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn }
  );
}

/** Generate a presigned GET URL for internal server → ffmpeg access. */
export async function presignedGet(
  key: string,
  expiresIn = 7200
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }),
    { expiresIn }
  );
}

/** Public URL via custom domain / R2 public bucket. */
export function publicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) throw new Error("R2_PUBLIC_URL is not set");
  return `${base.replace(/\/$/, "")}/${key}`;
}

/** Upload a buffer directly from the server to R2. Returns the public URL. */
export async function uploadBuffer(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return publicUrl(key);
}

/** Download a URL and re-upload to R2. Returns the public URL. */
export async function downloadAndUpload(
  sourceUrl: string,
  destKey: string,
  contentType: string
): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return uploadBuffer(destKey, buffer, contentType);
}

/** Derive file extension from MIME type. */
export function extFromMime(mime: string): string {
  switch (mime) {
    case "video/quicktime":
      return "mov";
    case "video/webm":
      return "webm";
    default:
      return "mp4";
  }
}
