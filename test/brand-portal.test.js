import assert from "node:assert/strict";
import test from "node:test";
import {
  fieldsToObject,
  normalizeMetaobject,
  slugify,
  upsertMetaobject,
} from "../app/lib/brand-portal.server.js";

test("slugify creates stable public handles", () => {
  assert.equal(slugify(" Providence Country Club "), "providence-country-club");
  assert.equal(slugify("Spring 2027! Fundraiser"), "spring-2027-fundraiser");
});

test("fieldsToObject preserves Shopify metaobject values", () => {
  assert.deepEqual(
    fieldsToObject([
      { key: "status", value: "live" },
      { key: "active", value: "true" },
    ]),
    { status: "live", active: "true" },
  );
});

test("fieldsToObject exposes resolved file-reference URLs", () => {
  assert.deepEqual(
    fieldsToObject([
      {
        key: "asset_file",
        value: "gid://shopify/GenericFile/1",
        reference: { url: "https://cdn.shopify.com/proof.pdf" },
      },
    ]),
    {
      asset_file: "gid://shopify/GenericFile/1",
      asset_file_url: "https://cdn.shopify.com/proof.pdf",
    },
  );
});

test("normalizeMetaobject combines identity and custom fields", () => {
  assert.deepEqual(
    normalizeMetaobject({
      id: "gid://shopify/Metaobject/1",
      handle: "sample",
      displayName: "Sample",
      updatedAt: "2026-09-14T00:00:00Z",
      fields: [{ key: "status", value: "draft" }],
    }),
    {
      id: "gid://shopify/Metaobject/1",
      handle: "sample",
      displayName: "Sample",
      updatedAt: "2026-09-14T00:00:00Z",
      status: "draft",
    },
  );
});

test("upsertMetaobject sends current MetaobjectUpsertInput fields", async () => {
  let variables;
  const admin = {
    graphql: async (_query, options) => {
      variables = options.variables;
      return {
        json: async () => ({
          data: {
            metaobjectUpsert: {
              metaobject: { id: "gid://shopify/Metaobject/1" },
              userErrors: [],
            },
          },
        }),
      };
    },
  };

  await upsertMetaobject(admin, {
    type: "aa_store_campaign",
    handle: "fall-2026",
    values: {
      campaign_name: "Fall 2026",
      products: ["gid://shopify/Product/1"],
      production_after_close: true,
      optional: null,
    },
  });

  assert.deepEqual(variables, {
    handle: { type: "aa_store_campaign", handle: "fall-2026" },
    metaobject: {
      handle: "fall-2026",
      fields: [
        { key: "campaign_name", value: "Fall 2026" },
        { key: "products", value: '["gid://shopify/Product/1"]' },
        { key: "production_after_close", value: "true" },
      ],
    },
  });
});
