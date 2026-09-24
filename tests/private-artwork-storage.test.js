import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import {
  artworkObjectKey,
  createPrivateArtworkStorage,
  privateArtworkConfig,
} from "../app/lib/private-artwork-storage.server.js";

const env = {
  ARTWORK_R2_ACCOUNT_ID: "a".repeat(32),
  ARTWORK_R2_BUCKET: "test-private-artwork",
  ARTWORK_R2_ACCESS_KEY_ID: "test-only-key",
  ARTWORK_R2_SECRET_ACCESS_KEY: "test-only-secret",
};
const shop = "test.myshopify.com";
const assetId = "12345678-abcd-4000-8000-123456789abc";
const file = () =>
  new File(["test artwork bytes"], "test.svg", { type: "image/svg+xml" });

test("private storage fails closed when credentials or identity are missing", () => {
  for (const name of Object.keys(env)) {
    assert.throws(
      () => privateArtworkConfig({ ...env, [name]: "" }),
      /not configured/,
    );
  }
  assert.throws(() =>
    privateArtworkConfig({
      ...env,
      ARTWORK_R2_ACCOUNT_ID: "evil.example/path",
    }),
  );
  assert.throws(() =>
    privateArtworkConfig({ ...env, ARTWORK_R2_BUCKET: "bucket/key" }),
  );
});

test("storage object identity is isolated by shop and rejects traversal", () => {
  assert.notEqual(
    artworkObjectKey(shop, assetId),
    artworkObjectKey("other.myshopify.com", assetId),
  );
  assert.throws(() => artworkObjectKey("../other", assetId));
  assert.throws(() => artworkObjectKey(shop, "../../secret"));
  assert.doesNotMatch(artworkObjectKey(shop, assetId), /test\.myshopify/);
});

test("uploads are immutable, preserve bytes/hash, and never return public links", async () => {
  const writes = [];
  const store = createPrivateArtworkStorage({
    env,
    client: { send: async (command) => writes.push(command.input) },
  });
  const first = await store.upload({ shop, file: file() });
  const second = await store.upload({ shop, file: file() });
  assert.notEqual(first.assetId, second.assetId);
  assert.equal(
    first.contentHash,
    createHash("sha256").update("test artwork bytes").digest("hex"),
  );
  assert.equal(first.filename, "test.svg");
  assert.equal(first.mimeType, "image/svg+xml");
  assert.equal(first.byteLength, 18);
  assert.equal(writes[0].IfNoneMatch, "*");
  assert.equal(writes[0].Bucket, env.ARTWORK_R2_BUCKET);
  assert.equal(writes[0].Body.toString(), "test artwork bytes");
  assert.equal(writes[0].Metadata.sha256, first.contentHash);
  assert.equal(writes[0].CacheControl, "private, no-store");
  assert.match(writes[0].ContentDisposition, /^attachment;/);
  assert.doesNotMatch(JSON.stringify(first), /https:|test-only-secret/);
});

test("invalid files fail before any storage write", async () => {
  let writes = 0;
  const store = createPrivateArtworkStorage({
    env,
    client: { send: async () => writes++ },
  });
  for (const invalid of [
    new File([], "empty.svg", { type: "image/svg+xml" }),
    new File(["html"], "x.html", { type: "text/html" }),
    new File([new Uint8Array(20 * 1024 * 1024 + 1)], "big.pdf", {
      type: "application/pdf",
    }),
  ]) {
    await assert.rejects(store.upload({ shop, file: invalid }));
  }
  assert.equal(writes, 0);
});

test("storage errors cannot leak sensitive SDK details", async () => {
  const store = createPrivateArtworkStorage({
    env,
    client: {
      send: async () => {
        throw new Error("SECRET signed request");
      },
    },
  });
  await assert.rejects(store.upload({ shop, file: file() }), {
    message: "Private artwork upload failed. Please try again.",
  });
});

test("download signing fixes bucket/key/expiry and strips filename header injection", async () => {
  let signed;
  const store = createPrivateArtworkStorage({
    env,
    client: {},
    sign: async (_client, command, options) => {
      signed = { input: command.input, options };
      return "signed";
    },
  });
  assert.equal(
    await store.downloadUrl({
      shop,
      assetId,
      filename: 'x.svg"\r\nBad: yes',
      bucket: "other",
      key: "secret",
    }),
    "signed",
  );
  assert.equal(signed.input.Bucket, env.ARTWORK_R2_BUCKET);
  assert.equal(signed.input.Key, artworkObjectKey(shop, assetId));
  assert.equal(signed.options.expiresIn, 60);
  assert.equal(signed.input.ResponseContentType, "application/octet-stream");
  assert.doesNotMatch(signed.input.ResponseContentDisposition, /[\r\n]/);
});

test("real SDK presigner produces one-object GET access with a 60-second lifetime", async () => {
  const client = new S3Client(privateArtworkConfig(env).client);
  try {
    const store = createPrivateArtworkStorage({ env, client });
    const url = new URL(
      await store.downloadUrl({ shop, assetId, filename: "test.svg" }),
    );
    assert.equal(url.searchParams.get("X-Amz-Expires"), "60");
    assert.ok(url.searchParams.get("X-Amz-Signature"));
    assert.ok(url.pathname.endsWith(artworkObjectKey(shop, assetId)));
    assert.match(url.hostname, /\.r2\.cloudflarestorage\.com$/);
    assert.equal(
      url.searchParams.get("response-content-type"),
      "application/octet-stream",
    );
    assert.doesNotMatch(url.href, /test-only-secret/);
  } finally {
    client.destroy();
  }
});
