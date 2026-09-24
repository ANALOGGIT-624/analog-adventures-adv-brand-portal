import assert from "node:assert/strict";
import process from "node:process";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  createPrivateArtworkStorage,
  privateArtworkConfig,
  artworkObjectKey,
} from "../app/lib/private-artwork-storage.server.js";

// Explicit opt-in live test. Uses only synthetic bytes, never customer files.
const config = privateArtworkConfig();
const client = new S3Client(config.client);
const store = createPrivateArtworkStorage({ client });
const shop = "storage-verification.myshopify.com";
const bytes =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
let asset;
try {
  asset = await store.upload({
    shop,
    file: new File([bytes], "synthetic-storage-test.svg", {
      type: "image/svg+xml",
    }),
  });
  console.log("PASS: synthetic private upload");
  const url = await store.downloadUrl(asset);
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), bytes);
  assert.match(response.headers.get("content-disposition"), /^attachment;/);
  console.log(
    "PASS: signed download, exact byte match, attachment disposition",
  );
  const unsigned = new URL(url);
  unsigned.search = "";
  const unsignedResponse = await fetch(unsigned);
  console.log("Unsigned request HTTP status:", unsignedResponse.status);
  // R2's S3 endpoint returns 400 for a request with no authentication fields.
  assert.ok([400, 401, 403].includes(unsignedResponse.status));
  assert.notEqual(await unsignedResponse.text(), bytes);
  console.log("PASS: unsigned request denied");
  const tampered = new URL(url);
  tampered.searchParams.set("X-Amz-Signature", "0".repeat(64));
  assert.equal((await fetch(tampered)).status, 403);
  console.log("PASS: tampered signature denied");
  console.log("Waiting for the 60-second signed link to expire...");
  await new Promise((resolve) => setTimeout(resolve, 65000));
  assert.equal((await fetch(url)).status, 403);
  console.log("PASS: expired link denied");
} catch (error) {
  console.error(
    "FAIL: live storage verification",
    error.name,
    error.code || "",
    error.$metadata?.httpStatusCode || "",
  );
  process.exitCode = 1;
} finally {
  if (asset) {
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: artworkObjectKey(shop, asset.assetId),
        }),
      );
      console.log("PASS: synthetic test object removed");
    } catch {
      console.error("FAIL: synthetic test object cleanup needs attention");
      process.exitCode = 1;
    }
  }
  client.destroy();
}
