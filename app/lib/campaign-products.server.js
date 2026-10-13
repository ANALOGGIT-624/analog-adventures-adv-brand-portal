export const CAMPAIGN_PRODUCTS_QUERY = `#graphql
  query CampaignProducts($after: String) {
    products(first: 100, after: $after, query: "status:active", sortKey: ID) {
      nodes { id title status }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export async function loadCampaignProducts(admin) {
  const products = new Map();
  const cursors = new Set();
  let after = null;
  for (;;) {
    const response = await admin.graphql(CAMPAIGN_PRODUCTS_QUERY, { variables: { after } });
    const payload = await response.json();
    if (payload.errors?.length) throw new Error(payload.errors.map(({ message }) => message).join("; "));
    const page = payload.data?.products;
    if (!Array.isArray(page?.nodes) || typeof page.pageInfo?.hasNextPage !== "boolean")
      throw new Error("Unable to load complete campaign product list");
    for (const product of page.nodes) products.set(product.id, product);
    if (!page.pageInfo.hasNextPage) return [...products.values()];
    const cursor = page.pageInfo.endCursor;
    if (!cursor || cursors.has(cursor)) throw new Error("Campaign product pagination did not advance");
    cursors.add(cursor);
    after = cursor;
  }
}
