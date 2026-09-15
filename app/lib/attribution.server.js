import { createHmac, timingSafeEqual } from "node:crypto";

export const ATTRIBUTION_PROPERTY = "_aa_attribution";

function requireSecret(secret) {
  if (!secret)
    throw new Error("SHOPIFY_API_SECRET is required for attribution.");
  return secret;
}

function signature(value, secret) {
  return createHmac("sha256", requireSecret(secret))
    .update(value)
    .digest("base64url");
}

export function signAttribution(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded + "." + signature(encoded, secret);
}

export function verifyAttribution(token, secret, now = new Date()) {
  if (typeof token !== "string") return null;
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return null;

  const expectedSignature = signature(encoded, secret);
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (
      payload.v !== 1 ||
      !payload.c ||
      !payload.p ||
      !payload.i ||
      !Number.isFinite(payload.e) ||
      payload.e * 1000 < now.getTime()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function attributionTokenForVariant({
  campaignHandle,
  productId,
  variantId,
  expiresAt,
  secret,
}) {
  return signAttribution(
    {
      v: 1,
      c: campaignHandle,
      p: String(productId),
      i: String(variantId),
      e: Math.floor(new Date(expiresAt).getTime() / 1000),
    },
    secret,
  );
}

function propertyValue(properties, name) {
  return properties?.find((property) => property.name === name)?.value;
}

export function signedLineAttributions(lineItems, secret, orderCreatedAt) {
  const verifiedAt = new Date(orderCreatedAt);
  return (lineItems || []).flatMap((line) => {
    const payload = verifyAttribution(
      propertyValue(line.properties, ATTRIBUTION_PROPERTY),
      secret,
      verifiedAt,
    );
    if (
      !payload ||
      String(line.product_id) !== payload.p ||
      String(line.variant_id) !== payload.i
    ) {
      return [];
    }
    return [{ line, token: payload }];
  });
}

export function tokenExpiry(campaign, now = new Date()) {
  const sevenDays = now.getTime() + 7 * 24 * 60 * 60 * 1000;
  const closesAt = campaign.closes_at
    ? new Date(campaign.closes_at).getTime()
    : sevenDays;
  return new Date(Math.min(sevenDays, closesAt));
}
