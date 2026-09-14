import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  PORTAL_TYPES,
  normalizeMetaobject,
  slugify,
  upsertMetaobject,
} from "../lib/brand-portal.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
      query OrganizationStoreIndex($type: String!) {
        companies(first: 50) {
          nodes { id name }
        }
        metaobjects(type: $type, first: 100) {
          nodes { id handle displayName updatedAt fields { key value } }
        }
      }
    `,
    { variables: { type: PORTAL_TYPES.organizationStore } },
  );
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map(({ message }) => message).join("; "));
  }

  return {
    companies: payload.data.companies.nodes,
    organizations: payload.data.metaobjects.nodes.map(normalizeMetaobject),
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const storeName = String(formData.get("store_name") || "").trim();
  const company = String(formData.get("company") || "").trim();
  const requestedSlug = String(formData.get("slug") || "").trim();

  if (!storeName || !company) {
    return { ok: false, error: "Store name and Shopify company are required." };
  }

  const slug = slugify(requestedSlug || storeName);
  if (!slug) {
    return { ok: false, error: "Enter a valid public slug." };
  }

  try {
    const organization = await upsertMetaobject(admin, {
      type: PORTAL_TYPES.organizationStore,
      handle: slug,
      values: {
        store_name: storeName,
        store_id:
          String(formData.get("store_id") || "").trim() ||
          "ORG-" + Date.now(),
        slug,
        company,
        status: String(formData.get("status") || "draft"),
        public_description: String(
          formData.get("public_description") || "",
        ).trim(),
        organizer_name: String(formData.get("organizer_name") || "").trim(),
        organizer_email: String(formData.get("organizer_email") || "").trim(),
        active: formData.get("active") === "true",
      },
    });
    return { ok: true, organization };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

function toneForStatus(status) {
  return ["active", "live"].includes(String(status).toLowerCase())
    ? "success"
    : "info";
}

export default function OrganizationStores() {
  const { companies, organizations } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Organization store saved");
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page
      heading="Organization stores"
      subheading="Create branded micro-store records without creating separate Shopify stores."
    >
      <s-section heading="Add organization store">
        {fetcher.data?.error && (
          <s-banner heading="Store was not saved" tone="critical">
            {fetcher.data.error}
          </s-banner>
        )}
        {companies.length === 0 ? (
          <s-banner heading="Create a Shopify company first" tone="warning">
            Organization stores must be connected to a verified Shopify company.
          </s-banner>
        ) : (
          <fetcher.Form method="post">
            <s-stack direction="block" gap="base">
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-text-field
                  label="Store name"
                  name="store_name"
                  placeholder="Matthews Elementary"
                  required
                />
                <s-text-field
                  label="Public slug"
                  name="slug"
                  placeholder="matthews-elementary"
                />
              </s-grid>
              <s-select label="Shopify company" name="company" required>
                <s-option value="">Select a company</s-option>
                {companies.map((company) => (
                  <s-option key={company.id} value={company.id}>
                    {company.name}
                  </s-option>
                ))}
              </s-select>
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-text-field
                  label="Organizer name"
                  name="organizer_name"
                  autocomplete="name"
                />
                <s-email-field
                  label="Organizer email"
                  name="organizer_email"
                  autocomplete="email"
                />
              </s-grid>
              <s-text-area
                label="Public description"
                name="public_description"
                rows={3}
                maxLength={500}
              />
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-select label="Status" name="status">
                  <s-option value="draft">Draft</s-option>
                  <s-option value="proofing">Proofing</s-option>
                  <s-option value="scheduled">Scheduled</s-option>
                  <s-option value="live">Live</s-option>
                  <s-option value="closed">Closed</s-option>
                  <s-option value="archived">Archived</s-option>
                </s-select>
                <s-select label="Available to campaigns" name="active">
                  <s-option value="false">Not yet</s-option>
                  <s-option value="true">Yes</s-option>
                </s-select>
              </s-grid>
              <s-button type="submit" variant="primary" loading={busy}>
                Save organization store
              </s-button>
            </s-stack>
          </fetcher.Form>
        )}
      </s-section>

      <s-section heading="Existing stores">
        {organizations.length === 0 ? (
          <s-paragraph>No organization stores have been created.</s-paragraph>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Store</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Slug</s-table-header>
              <s-table-header>Organizer</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {organizations.map((organization) => (
                <s-table-row key={organization.id}>
                  <s-table-cell>{organization.store_name}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={toneForStatus(organization.status)}>
                      {organization.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{organization.slug}</s-table-cell>
                  <s-table-cell>
                    {organization.organizer_name || "Not assigned"}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
