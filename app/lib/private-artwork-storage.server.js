import { createHash, randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { validateProofFile } from "./proof-workflow.server.js";

export const ARTWORK_DOWNLOAD_SECONDS = 60;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function privateArtworkConfig(env = process.env) {
  const accountId = env.ARTWORK_R2_ACCOUNT_ID || "";
  const bucket = env.ARTWORK_R2_BUCKET || "";
  const accessKeyId = env.ARTWORK_R2_ACCESS_KEY_ID || "";
  const secretAccessKey = env.ARTWORK_R2_SECRET_ACCESS_KEY || "";
  if (
    !/^[a-f0-9]{32}$/.test(accountId) ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
    !accessKeyId ||
    !secretAccessKey
  ) {
    throw new Error("Private artwork storage is not configured.");
  }
  return {
    bucket,
    client: {
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    },
  };
}

export function artworkObjectKey(shop, assetId) {
  if (
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ||
    !UUID.test(assetId)
  ) {
    throw new Error("Invalid private artwork identity.");
  }
  const shopHash = createHash("sha256").update(shop).digest("hex");
  return `artwork/${shopHash}/${assetId}`;
}

function attachmentDisposition(filename) {
  // ASCII fallback avoids response-header injection and active inline content.
  const safe = String(filename || "artwork")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .slice(0, 180);
  return `attachment; filename="${safe || "artwork"}"`;
}

/** Low-level storage only. Callers MUST authorize the current parent record
 * before upload/download and persist returned identity in an asset registry.
 * This adapter never accepts a browser-provided URL, bucket or object key.
 */
export function createPrivateArtworkStorage({
  env = process.env,
  client,
  sign = getSignedUrl,
} = {}) {
  const config = privateArtworkConfig(env);
  const s3 = client || new S3Client(config.client);
  return {
    async upload({ shop, file }) {
      validateProofFile(file);
      const assetId = randomUUID();
      const key = artworkObjectKey(shop, assetId);
      const bytes = Buffer.from(await file.arrayBuffer());
      const hash = createHash("sha256").update(bytes).digest("hex");
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: bytes,
            ContentLength: bytes.length,
            ContentType: file.type,
            ContentDisposition: attachmentDisposition(file.name),
            CacheControl: "private, no-store",
            IfNoneMatch: "*",
            Metadata: { sha256: hash },
          }),
        );
      } catch {
        // Do not expose SDK request metadata, signatures or credentials to a UI.
        throw new Error("Private artwork upload failed. Please try again.");
      }
      return {
        assetId,
        shop,
        filename: file.name,
        mimeType: file.type,
        byteLength: bytes.length,
        contentHash: hash,
        uploadedAt: new Date().toISOString(),
      };
    },
    async downloadUrl(asset) {
      const key = artworkObjectKey(asset.shop, asset.assetId);
      try {
        return await sign(
          s3,
          new GetObjectCommand({
            Bucket: config.bucket,
            Key: key,
            ResponseContentDisposition: attachmentDisposition(asset.filename),
            ResponseContentType: "application/octet-stream",
            ResponseCacheControl: "private, no-store",
          }),
          { expiresIn: ARTWORK_DOWNLOAD_SECONDS },
        );
      } catch {
        throw new Error(
          "Private artwork download is unavailable. Please try again.",
        );
      }
    },
  };
}
