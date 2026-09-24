import { createHash, randomUUID } from "node:crypto";
import { PORTAL_TYPES, normalizeMetaobject } from "./brand-portal.server.js";
import { gql, loadDelivery } from "./bulk-delivery.server.js";
import { isCampaignLive, referenceIds } from "./public-storefront.server.js";
import {
  ATTRIBUTION_PROPERTY,
  signAttribution,
  verifyAttribution,
  attributionTokenForVariant,
  tokenExpiry,
} from "./attribution.server.js";
import { approvedProofForCampaign } from "./proof-workflow.server.js";

export const BULK_CHECKOUT_ATTRIBUTE = "_aa_bulk_checkout";
export function checkoutToken(
  organization,
  campaign,
  secret,
  now = new Date(),
) {
  return signAttribution(
    {
      v: 1,
      c: campaign.handle,
      p: organization.id,
      i: randomUUID(),
      purpose: "bulk-checkout",
      e: Math.floor(now.getTime() / 1000) + 1800,
    },
    secret,
  );
}
export async function createBulkCheckout({
  admin,
  attempts,
  shop,
  slug,
  form,
  secret,
  now = new Date(),
}) {
  const token = verifyAttribution(
    String(form.get("checkout_token") || ""),
    secret,
    now,
  );
  if (!token || token.purpose !== "bulk-checkout")
    throw new Error("Checkout expired. Reload the store and try again.");
  const data = await gql(
    admin,
    `#graphql
    query BulkCheckoutContext($organizationId: ID!, $campaign: MetaobjectHandleInput!, $proofType: String!) {
      organization: metaobject(id: $organizationId) { id handle fields { key value } }
      campaign: metaobjectByHandle(handle: $campaign) { id handle fields { key value } }
      proofs: metaobjects(type: $proofType, first: 100) { nodes { id handle fields { key value } } }
      shop { currencyCode }
    }`,
    {
      organizationId: token.p,
      campaign: { type: PORTAL_TYPES.campaign, handle: token.c },
      proofType: PORTAL_TYPES.artworkProof,
    },
  );
  const organization =
    data.organization && normalizeMetaobject(data.organization);
  const campaign = data.campaign && normalizeMetaobject(data.campaign);
  if (
    !organization ||
    organization.slug !== slug ||
    organization.status !== "live" ||
    !campaign ||
    campaign.organization_store !== organization.id ||
    !isCampaignLive(campaign, now) ||
    campaign.fulfillment_mode !== "bulk_to_organizer"
  )
    throw new Error("This bulk campaign is not available for checkout.");
  const address = await loadDelivery(admin, organization.id);
  if (!address)
    throw new Error(
      "The organizer delivery address has not been configured. Please contact the store.",
    );
  const ids = referenceIds(campaign.products);
  const selections = [];
  for (const [key, raw] of form) {
    if (!key.startsWith("quantity.")) continue;
    const productId = key.slice(9);
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100)
      throw new Error("Choose a quantity from 0 to 100.");
    if (!quantity) continue;
    if (
      !ids.includes(`gid://shopify/Product/${productId}`) ||
      selections.some((x) => x.productId === productId)
    )
      throw new Error("Choose products from this campaign.");
    const variantId = String(form.get(`variant.${productId}`) || "");
    if (!/^\d+$/.test(variantId))
      throw new Error("Choose a valid product option.");
    selections.push({ productId, variantId, quantity });
  }
  if (!selections.length || selections.length > 50)
    throw new Error("Select at least one item (up to 50 product selections).");
  const productData = await gql(
    admin,
    `#graphql
    query BulkCheckoutVariants($ids: [ID!]!, $ruleId: ID!) {
      nodes(ids: $ids) { ... on ProductVariant {
        id availableForSale inventoryQuantity inventoryPolicy price inventoryItem { tracked }
        product { id status requiresSellingPlan }
      } }
      rule: metaobject(id: $ruleId) { id fields { key value } }
    }`,
    {
      ids: selections.map((x) => `gid://shopify/ProductVariant/${x.variantId}`),
      ruleId: campaign.payout_rule,
    },
  );
  const rule = productData.rule && normalizeMetaobject(productData.rule);
  if (!rule)
    throw new Error(
      "Campaign payout settings are incomplete. Please contact the store.",
    );
  const proof = approvedProofForCampaign(
    data.proofs.nodes.map(normalizeMetaobject),
    campaign.id,
  );
  const lines = selections.map((selection) => {
    const variant = productData.nodes.find(
      (x) => x?.id === `gid://shopify/ProductVariant/${selection.variantId}`,
    );
    if (
      !variant ||
      variant.product.id !== `gid://shopify/Product/${selection.productId}` ||
      variant.product.status !== "ACTIVE" ||
      !variant.availableForSale ||
      variant.product.requiresSellingPlan ||
      (variant.inventoryItem?.tracked &&
        variant.inventoryPolicy === "DENY" &&
        variant.inventoryQuantity < selection.quantity)
    ) {
      throw new Error(
        "A selected item is unavailable in that quantity. Reload the store and update your selection.",
      );
    }
    return { ...selection, variant };
  });
  const snapshot = lines.map(({ productId, variantId, quantity }) => ({
    productId: `gid://shopify/Product/${productId}`,
    variantId: `gid://shopify/ProductVariant/${variantId}`,
    quantity,
    organizationStoreId: organization.id,
    campaignId: campaign.id,
    campaignHandle: campaign.handle,
    payoutRuleId: rule.id,
    payoutRuleSnapshot: {
      name: rule.rule_name,
      method: rule.method,
      rate: rule.rate,
      basis: rule.basis,
      settlementDelayDays: rule.settlement_delay_days || "0",
    },
    artworkProofSnapshot: proof
      ? {
          id: proof.id,
          version: Number(proof.version_number || 0),
          fileId: proof.asset_file,
          privateAssetId: proof.private_asset_id,
          contentHash: proof.content_hash,
        }
      : null,
  }));
  const id = createHash("sha256").update(`${shop}:${token.i}`).digest("hex");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ selections, address, snapshot }))
    .digest("hex");
  try {
    await attempts.create({
      data: { id, shop, fingerprint, snapshot: JSON.stringify(snapshot) },
    });
  } catch (error) {
    if (error.code !== "P2002") throw error;
    const previous = await attempts.findUnique({ where: { id } });
    if (previous?.fingerprint === fingerprint && previous.invoiceUrl)
      return previous.invoiceUrl;
    throw new Error(
      "This checkout is already being prepared or its details changed. Wait a moment and retry. If it persists, contact the store before creating another checkout.",
    );
  }
  const input = {
    lineItems: lines.map(({ variant, productId, variantId, quantity }) => ({
      variantId: variant.id,
      quantity,
      customAttributes: [
        {
          key: ATTRIBUTION_PROPERTY,
          value: attributionTokenForVariant({
            campaignHandle: campaign.handle,
            productId,
            variantId,
            expiresAt: tokenExpiry(campaign, now),
            secret,
          }),
        },
        { key: "_aa_campaign_name", value: campaign.campaign_name },
        { key: "_aa_organization_name", value: organization.store_name },
      ],
    })),
    shippingAddress: address,
    useCustomerDefaultAddress: false,
    shippingLine: {
      title: "Bulk delivery to organizer",
      priceWithCurrency: {
        amount: "0.00",
        currencyCode: data.shop.currencyCode,
      },
    },
    presentmentCurrencyCode: data.shop.currencyCode,
    allowDiscountCodesInCheckout: false,
    customAttributes: [{ key: BULK_CHECKOUT_ATTRIBUTE, value: id }],
    tags: ["aa-bulk-to-organizer"],
    note: "Bulk delivery to organizer. Individual customers pay no shipping. Organizer shipping is handled separately.",
  };
  const created = await gql(
    admin,
    `#graphql
    mutation CreateBulkCheckout($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id invoiceUrl }
        userErrors { field message }
      }
    }`,
    { input },
  );
  const result = created.draftOrderCreate;
  if (result.userErrors?.length) {
    // Shopify explicitly rejected creation: safe to retry after correcting the cart.
    await attempts.delete({ where: { id } });
    throw new Error(result.userErrors.map((x) => x.message).join("; "));
  }
  if (!result.draftOrder?.invoiceUrl)
    throw new Error(
      "Checkout could not be confirmed. Please contact the store before trying again.",
    );
  await attempts.update({
    where: { id },
    data: {
      draftId: result.draftOrder.id,
      invoiceUrl: result.draftOrder.invoiceUrl,
    },
  });
  return result.draftOrder.invoiceUrl;
}

// Validate the actual Shopify draft->order relationship, not customer-editable attributes.
// The creation snapshot keeps attribution intact if the invoice is paid after campaign close.
export async function bulkOrderManifest({ admin, attempts, payload, shop }) {
  const key = payload.note_attributes?.find(
    (x) => x.name === BULK_CHECKOUT_ATTRIBUTE,
  )?.value;
  if (!key) return null;
  const attempt = await attempts.findUnique({ where: { id: key } });
  if (!attempt || attempt.shop !== shop || !attempt.draftId)
    throw new Error("Bulk checkout attribution is not yet available.");
  const data = await gql(
    admin,
    `#graphql
    query ConfirmBulkOrder($id: ID!) { draftOrder(id: $id) { order { id } } }
  `,
    { id: attempt.draftId },
  );
  const orderId =
    payload.admin_graphql_api_id || `gid://shopify/Order/${payload.id}`;
  if (data.draftOrder?.order?.id !== orderId)
    throw new Error("Bulk checkout order does not match the saved draft.");
  const snapshot = JSON.parse(attempt.snapshot);
  return (payload.line_items || []).map((line) => {
    const saved = snapshot.find(
      (x) =>
        x.variantId === `gid://shopify/ProductVariant/${line.variant_id}` &&
        x.productId === `gid://shopify/Product/${line.product_id}`,
    );
    if (!saved || Number(line.quantity) !== saved.quantity)
      throw new Error("Bulk checkout line differs from its saved snapshot.");
    return {
      ...saved,
      lineItemId: String(line.id),
      quantity: Number(line.quantity),
      linePrice: String(line.price || "0"),
    };
  });
}
