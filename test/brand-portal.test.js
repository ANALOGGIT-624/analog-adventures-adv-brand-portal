import assert from "node:assert/strict";
import test from "node:test";
import {
  fieldsToObject,
  normalizeMetaobject,
  slugify,
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
