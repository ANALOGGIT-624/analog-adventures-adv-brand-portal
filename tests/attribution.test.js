import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTRIBUTION_PROPERTY,
  attributionTokenForVariant,
  signedLineAttributions,
  signAttribution,
  tokenExpiry,
  verifyAttribution,
} from "../app/lib/attribution.server.js";

const secret = "test-secret";
const now = new Date("2026-09-15T12:00:00Z");

test("signed attribution round-trips and rejects tampering", () => {
  const payload = { v: 1, c: "fall-2026", p: "10", i: "20", e: 1800000000 };
  const token = signAttribution(payload, secret);
  assert.deepEqual(verifyAttribution(token, secret, now), payload);
  assert.equal(verifyAttribution(token + "x", secret, now), null);
});

test("expired attribution is rejected", () => {
  const token = signAttribution(
    { v: 1, c: "fall-2026", p: "10", i: "20", e: 1 },
    secret,
  );
  assert.equal(verifyAttribution(token, secret, now), null);
});

test("line attribution must match the purchased product and variant", () => {
  const token = attributionTokenForVariant({
    campaignHandle: "fall-2026",
    productId: 10,
    variantId: 20,
    expiresAt: "2026-09-20T00:00:00Z",
    secret,
  });
  const property = [{ name: ATTRIBUTION_PROPERTY, value: token }];
  const verified = signedLineAttributions(
    [{ id: 1, product_id: 10, variant_id: 20, properties: property }],
    secret,
    now,
  );
  assert.equal(verified.length, 1);
  assert.equal(verified[0].token.c, "fall-2026");

  const rejected = signedLineAttributions(
    [{ id: 2, product_id: 10, variant_id: 21, properties: property }],
    secret,
    now,
  );
  assert.equal(rejected.length, 0);
});

test("token expiry uses the earlier of seven days and campaign close", () => {
  assert.equal(
    tokenExpiry({ closes_at: "2026-09-16T00:00:00Z" }, now).toISOString(),
    "2026-09-16T00:00:00.000Z",
  );
  assert.equal(tokenExpiry({}, now).toISOString(), "2026-09-22T12:00:00.000Z");
});
