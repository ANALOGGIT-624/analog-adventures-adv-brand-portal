import prisma from "../db.server";
import { bulkOrderManifest } from "../lib/bulk-checkout.server";
import process from "node:process";
import { authenticate } from "../shopify.server";
import { PORTAL_TYPES, normalizeMetaobject } from "../lib/brand-portal.server";
import { referenceIds } from "../lib/public-storefront.server";
import { signedLineAttributions } from "../lib/attribution.server";
import { approvedProofForCampaign } from "../lib/proof-workflow.server";

function oneOrMultiple(values) {
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : "multiple";
}

export const action = async ({ request }) => {
  const { admin, payload, shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (!admin) return new Response();

  const bulkManifest = await bulkOrderManifest({
    admin,
    attempts: prisma.bulkCheckoutAttempt,
    payload,
    shop,
  });
  let manifest = bulkManifest;
  if (!manifest) {
    const signedLines = signedLineAttributions(
      payload.line_items,
      process.env.SHOPIFY_API_SECRET,
      payload.created_at,
    );
    if (!signedLines.length) return new Response();

    const response = await admin.graphql(
      `#graphql
      query AttributionReferenceData(
        $campaignType: String!
        $payoutRuleType: String!
        $proofType: String!
      ) {
        campaigns: metaobjects(type: $campaignType, first: 100) {
          nodes { id handle displayName fields { key value } }
        }
        payoutRules: metaobjects(type: $payoutRuleType, first: 100) {
          nodes { id handle displayName fields { key value } }
        }
        proofs: metaobjects(type: $proofType, first: 100) {
          nodes { id handle displayName fields { key value } }
        }
      }
    `,
      {
        variables: {
          campaignType: PORTAL_TYPES.campaign,
          payoutRuleType: PORTAL_TYPES.payoutRule,
          proofType: PORTAL_TYPES.artworkProof,
        },
      },
    );
    const referencePayload = await response.json();
    if (referencePayload.errors?.length) {
      throw new Error(
        referencePayload.errors.map(({ message }) => message).join("; "),
      );
    }

    const campaigns =
      referencePayload.data.campaigns.nodes.map(normalizeMetaobject);
    const payoutRules =
      referencePayload.data.payoutRules.nodes.map(normalizeMetaobject);
    const proofs = referencePayload.data.proofs.nodes.map(normalizeMetaobject);
    const orderCreatedAt = new Date(payload.created_at);
    manifest = signedLines.flatMap(({ line, token }) => {
      const campaign = campaigns.find(({ handle }) => handle === token.c);
      const productGid = `gid://shopify/Product/${token.p}`;
      if (
        !campaign ||
        String(campaign.status).toLowerCase() !== "live" ||
        (campaign.starts_at && new Date(campaign.starts_at) > orderCreatedAt) ||
        (campaign.closes_at && new Date(campaign.closes_at) < orderCreatedAt) ||
        !referenceIds(campaign.products).includes(productGid)
      ) {
        return [];
      }

      const payoutRule = payoutRules.find(
        ({ id }) => id === campaign.payout_rule,
      );
      if (!payoutRule) return [];
      const approvedProof = approvedProofForCampaign(proofs, campaign.id);

      return [
        {
          lineItemId: String(line.id),
          productId: productGid,
          variantId: `gid://shopify/ProductVariant/${token.i}`,
          quantity: Number(line.quantity || 0),
          linePrice: String(line.price || "0"),
          organizationStoreId: campaign.organization_store,
          campaignId: campaign.id,
          campaignHandle: campaign.handle,
          payoutRuleId: payoutRule.id,
          payoutRuleSnapshot: {
            name: payoutRule.rule_name,
            method: payoutRule.method,
            rate: payoutRule.rate,
            basis: payoutRule.basis,
            settlementDelayDays: payoutRule.settlement_delay_days || "0",
          },
          artworkProofSnapshot: approvedProof
            ? {
                id: approvedProof.id,
                version: Number(approvedProof.version_number || 0),
                fileId: approvedProof.asset_file,
                privateAssetId: approvedProof.private_asset_id,
                contentHash: approvedProof.content_hash,
              }
            : null,
        },
      ];
    });
  }

  if (!manifest.length) return new Response();

  const ownerId =
    payload.admin_graphql_api_id || `gid://shopify/Order/${payload.id}`;
  const organizationIds = manifest.map(
    ({ organizationStoreId }) => organizationStoreId,
  );
  const campaignIds = manifest.map(({ campaignId }) => campaignId);
  const payoutRuleIds = manifest.map(({ payoutRuleId }) => payoutRuleId);
  const metafields = [
    {
      ownerId,
      key: "attribution_manifest",
      type: "json",
      value: JSON.stringify({
        version: 2,
        verifiedAt: new Date().toISOString(),
        lines: manifest,
      }),
    },
    {
      ownerId,
      key: "attribution_status",
      type: "single_line_text_field",
      value: "verified",
    },
    {
      ownerId,
      key: "organization_store_id",
      type: "single_line_text_field",
      value: oneOrMultiple(organizationIds),
    },
    {
      ownerId,
      key: "campaign_id",
      type: "single_line_text_field",
      value: oneOrMultiple(campaignIds),
    },
    {
      ownerId,
      key: "payout_rule_id",
      type: "single_line_text_field",
      value: oneOrMultiple(payoutRuleIds),
    },
  ];
  const writeResponse = await admin.graphql(
    `#graphql
      mutation RecordOrderAttribution($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id key }
          userErrors { field message code }
        }
      }
    `,
    { variables: { metafields } },
  );
  const writePayload = await writeResponse.json();
  const errors = writePayload.data?.metafieldsSet?.userErrors || [];
  if (writePayload.errors?.length || errors.length) {
    throw new Error(
      [...(writePayload.errors || []), ...errors]
        .map(({ message }) => message)
        .join("; "),
    );
  }

  return new Response();
};
