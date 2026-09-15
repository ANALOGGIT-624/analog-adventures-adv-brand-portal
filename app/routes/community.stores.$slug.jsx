import { authenticate } from "../shopify.server";
import {
  PORTAL_TYPES,
  normalizeMetaobject,
} from "../lib/brand-portal.server";
import {
  escapeHtml,
  isCampaignLive,
  referenceIds,
  safeColor,
} from "../lib/public-storefront.server";

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function renderStore({ organization, campaign, products }) {
  const primary = safeColor(organization.primary_color, "#111827");
  const secondary = safeColor(organization.secondary_color, "#f3f4f6");
  const productCards = products.length
    ? products
        .map((product) => {
          const image = product.featuredMedia?.preview?.image;
          const price = product.variants.nodes[0]?.price;
          return `
            <article class="aa-product-card">
              ${
                image
                  ? `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(
                      image.altText || product.title,
                    )}" width="${image.width || 800}" height="${image.height || 800}">`
                  : ""
              }
              <div class="aa-product-card__content">
                <h3>${escapeHtml(product.title)}</h3>
                ${price ? `<p>${money(price)}</p>` : ""}
                <a href="/products/${encodeURIComponent(product.handle)}">View product</a>
              </div>
            </article>`;
        })
        .join("")
    : "<p>No products are available for this campaign yet.</p>";

  return `
    <style>
      .aa-store { --aa-primary: ${primary}; --aa-secondary: ${secondary}; max-width: 1200px; margin: 0 auto; padding: 32px 20px 64px; }
      .aa-store__hero { background: var(--aa-secondary); border-radius: 20px; padding: clamp(28px, 6vw, 72px); text-align: center; }
      .aa-store__hero h1 { color: var(--aa-primary); font-size: clamp(2rem, 5vw, 4rem); margin: 0 0 12px; }
      .aa-store__hero p { font-size: 1.1rem; margin: 0 auto; max-width: 700px; }
      .aa-store__campaign { margin: 28px 0 18px; }
      .aa-store__campaign h2 { margin-bottom: 6px; }
      .aa-product-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; }
      .aa-product-card { border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; background: #fff; }
      .aa-product-card img { display: block; width: 100%; height: auto; aspect-ratio: 1; object-fit: cover; }
      .aa-product-card__content { padding: 18px; }
      .aa-product-card__content h3 { margin: 0 0 8px; }
      .aa-product-card__content a { display: inline-block; background: var(--aa-primary); color: #fff; border-radius: 999px; padding: 10px 18px; text-decoration: none; }
    </style>
    <main class="aa-store">
      <section class="aa-store__hero">
        <h1>${escapeHtml(organization.store_name)}</h1>
        <p>${escapeHtml(organization.public_description || "Shop this organization campaign.")}</p>
      </section>
      <section class="aa-store__campaign">
        <h2>${escapeHtml(campaign.campaign_name)}</h2>
        ${
          campaign.closes_at
            ? `<p>Campaign closes ${escapeHtml(
                new Date(campaign.closes_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }),
              )}.</p>`
            : ""
        }
      </section>
      <section class="aa-product-grid">${productCards}</section>
    </main>`;
}

export const loader = async ({ request, params }) => {
  const { admin, liquid } = await authenticate.public.appProxy(request);

  if (!admin) {
    return new Response("Store connection is unavailable.", { status: 401 });
  }

  const response = await admin.graphql(
    `#graphql
      query PublicOrganizationStore(
        $organizationType: String!
        $campaignType: String!
      ) {
        organizations: metaobjects(type: $organizationType, first: 100) {
          nodes { id handle displayName fields { key value } }
        }
        campaigns: metaobjects(type: $campaignType, first: 100) {
          nodes { id handle displayName fields { key value } }
        }
      }
    `,
    {
      variables: {
        organizationType: PORTAL_TYPES.organizationStore,
        campaignType: PORTAL_TYPES.campaign,
      },
    },
  );
  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(payload.errors.map(({ message }) => message).join("; "));
  }

  const organization = payload.data.organizations.nodes
    .map(normalizeMetaobject)
    .find(
      (entry) =>
        entry.slug === params.slug &&
        String(entry.status).toLowerCase() === "live",
    );

  if (!organization) {
    return liquid("<h1>Organization store not found</h1>", {
      layout: true,
      status: 404,
    });
  }

  const campaign = payload.data.campaigns.nodes
    .map(normalizeMetaobject)
    .find(
      (entry) =>
        entry.organization_store === organization.id && isCampaignLive(entry),
    );

  if (!campaign) {
    return liquid(
      `<main style="max-width:900px;margin:0 auto;padding:48px 20px"><h1>${escapeHtml(
        organization.store_name,
      )}</h1><p>This organization does not have an active campaign right now.</p></main>`,
      { layout: true },
    );
  }

  const productIds = referenceIds(campaign.products);
  let products = [];

  if (productIds.length) {
    const productsResponse = await admin.graphql(
      `#graphql
        query PublicCampaignProducts($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              handle
              status
              featuredMedia {
                preview {
                  image { url altText width height }
                }
              }
              variants(first: 1) { nodes { price } }
            }
          }
        }
      `,
      { variables: { ids: productIds } },
    );
    const productsPayload = await productsResponse.json();
    if (productsPayload.errors?.length) {
      throw new Error(
        productsPayload.errors.map(({ message }) => message).join("; "),
      );
    }
    products = productsPayload.data.nodes.filter(
      (product) => product?.status === "ACTIVE",
    );
  }

  return liquid(renderStore({ organization, campaign, products }), {
    layout: true,
  });
};
