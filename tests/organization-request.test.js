import assert from "node:assert/strict";
import test from "node:test";
import {
  createOrganizationRequestValues,
  updateOrganizationRequestValues,
} from "../app/lib/organization-request.server.js";

test("organizer request snapshots identity, assignment, dates, and details", () => {
  const values = createOrganizationRequestValues(
    {
      requestType: "new_campaign",
      title: "Spring preschool campaign",
      details: "Use the approved Tot Time logo and add blue name tags.",
      requestedStartDate: "2027-03-01",
      requestedCloseDate: "2027-03-31",
    },
    {
      customerId: "gid://shopify/Customer/1",
      companyId: "gid://shopify/Company/2",
      organizationId: "gid://shopify/Metaobject/3",
    },
    "2026-09-17T16:00:00.123Z",
  );

  assert.equal(values.request_id, "ORG-REQ-20260917160000123");
  assert.equal(values.status, "submitted");
  assert.equal(values.organization_store_id, "gid://shopify/Metaobject/3");
  assert.equal(values.requested_details.requestedStartDate, "2027-03-01");
});

test("request creation requires an assigned company and meaningful content", () => {
  assert.throws(
    () =>
      createOrganizationRequestValues(
        {
          requestType: "new_store",
          title: "Store",
          details: "Please create it.",
        },
        { customerId: "gid://shopify/Customer/1" },
      ),
    /company contact/i,
  );
  assert.throws(
    () =>
      createOrganizationRequestValues(
        {
          requestType: "unknown",
          title: "Store",
          details: "Please create it.",
        },
        { customerId: "1", companyId: "2" },
      ),
    /valid request type/i,
  );
});

test("requested campaign dates must be valid and ordered", () => {
  const context = { customerId: "1", companyId: "2" };
  assert.throws(
    () =>
      createOrganizationRequestValues(
        {
          requestType: "new_store",
          title: "Store",
          details: "Please create it.",
          requestedStartDate: "not-a-date",
        },
        context,
      ),
    /valid calendar dates/i,
  );
  assert.throws(
    () =>
      createOrganizationRequestValues(
        {
          requestType: "new_campaign",
          title: "Campaign",
          details: "Spring sale.",
          requestedStartDate: "2027-04-01",
          requestedCloseDate: "2027-03-01",
        },
        context,
      ),
    /close date/i,
  );
});

test("staff status transitions preserve the organizer snapshot", () => {
  const request = createOrganizationRequestValues(
    {
      requestType: "branding_change",
      title: "New logo",
      details: "Use version four.",
    },
    { customerId: "1", companyId: "2", organizationId: "3" },
    "2026-09-17T16:00:00.000Z",
  );
  const reviewed = updateOrganizationRequestValues(
    request,
    "in_review",
    "Waiting for vector artwork.",
    "2026-09-17T17:00:00.000Z",
  );
  assert.equal(reviewed.status, "in_review");
  assert.equal(reviewed.requested_details.details, "Use version four.");
  assert.equal(reviewed.reviewed_at, "2026-09-17T17:00:00.000Z");
});

test("completed requests are locked and invalid transitions are rejected", () => {
  assert.throws(
    () =>
      updateOrganizationRequestValues({ status: "submitted" }, "completed", ""),
    /cannot move/i,
  );
  assert.throws(
    () =>
      updateOrganizationRequestValues({ status: "completed" }, "in_review", ""),
    /cannot move/i,
  );
});
