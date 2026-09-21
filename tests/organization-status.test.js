import assert from "node:assert/strict";
import test from "node:test";
import { updateOrganizationStatus } from "../app/lib/organization-status.server.js";

test("organization status update writes only status to the existing handle", async () => {
  const calls = [];
  const admin = { graphql: async (query, options) => {
    calls.push(options.variables);
    return { json: async () => query.includes("query OrganizationStatusTarget")
      ? { data: { metaobjectByHandle: { id: "org-1", handle: "test-company-pilot" } } }
      : { data: { metaobjectUpsert: { metaobject: { id: "org-1" }, userErrors: [] } } } };
  } };
  await updateOrganizationStatus(admin, "test-company-pilot", "live");
  assert.equal(calls[1].handle.handle, "test-company-pilot");
  assert.deepEqual(calls[1].metaobject.fields, [{ key: "status", value: "live" }]);
});

test("invalid statuses and missing selections do not call Shopify", async () => {
  const admin = { graphql: () => assert.fail("Unexpected API call") };
  await assert.rejects(updateOrganizationStatus(admin, "", "live"));
  await assert.rejects(updateOrganizationStatus(admin, "test", "invalid"));
});

test("missing organizations cannot be created through status updates", async () => {
  let calls = 0;
  const admin = { graphql: async () => { calls++; return { json: async () => ({ data: { metaobjectByHandle: null } }) }; } };
  await assert.rejects(updateOrganizationStatus(admin, "missing", "live"), /no longer exists/);
  assert.equal(calls, 1);
});
