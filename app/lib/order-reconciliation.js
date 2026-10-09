export const RECONCILE_ORDERS_QUERY = `#graphql
query ReconcileOrders($after: String, $query: String!) {
  orders(first: 25, after: $after, query: $query, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt customAttributes { key value }
      lineItems(first: 100) {
        pageInfo { hasNextPage }
        nodes { id quantity originalUnitPriceSet { shopMoney { amount } }
          product { id } variant { id } customAttributes { key value } }
      }
    }
  }
}`;
const numeric = (id) => id?.split("/").at(-1);
export function orderPayload(order) {
  if (order.lineItems.pageInfo.hasNextPage)
    throw Error("Order exceeds reconciliation line limit");
  return {
    admin_graphql_api_id: order.id,
    created_at: order.createdAt,
    note_attributes: order.customAttributes.map((x) => ({
      name: x.key,
      value: x.value,
    })),
    line_items: order.lineItems.nodes.map((x) => ({
      id: numeric(x.id),
      product_id: numeric(x.product?.id),
      variant_id: numeric(x.variant?.id),
      quantity: x.quantity,
      price: x.originalUnitPriceSet.shopMoney.amount,
      properties: x.customAttributes.map((a) => ({
        name: a.key,
        value: a.value,
      })),
    })),
  };
}
// Every completed sweep revisits the accessible window. Failed records are not
// forgotten when a cursor advances, and crashes replay the unfinished page.
export async function reconcileBatch({
  admin,
  processOrder,
  load,
  save,
  now = new Date(),
  pages = 2,
}) {
  let state = await load();
  if (!state?.windowEnd)
    state = {
      windowEnd: now.toISOString(),
      windowStart: new Date(now.getTime() - 59 * 86400000).toISOString(),
      cursor: null,
      issues: state?.issues || [],
      completedAt: state?.completedAt,
      scanned: 0,
      recovered: 0,
    };
  for (let page = 0; page < pages; page++) {
    const result = await (
      await admin.graphql(RECONCILE_ORDERS_QUERY, {
        variables: {
          after: state.cursor,
          query: `created_at:>='${state.windowStart}' created_at:<='${state.windowEnd}'`,
        },
      })
    ).json();
    if (result.errors?.length || !result.data?.orders)
      throw Error("Reconciliation order query failed");
    const orders = result.data.orders;
    for (const order of orders.nodes) {
      try {
        const outcome = await processOrder(orderPayload(order));
        const tagged =
          order.customAttributes.some((x) => x.key === "_aa_bulk_checkout") ||
          order.lineItems.nodes.some((x) =>
            x.customAttributes.some((a) => a.key === "_aa_attribution"),
          );
        if (outcome === "unattributed" && tagged)
          throw Error("Tagged order requires review");
        state.issues = state.issues.filter((x) => x.id !== order.id);
        if (outcome === "recovered") state.recovered++;
      } catch {
        if (!state.issues.some((x) => x.id === order.id))
          state.issues.push({ id: order.id, name: order.name });
      }
      state.scanned++;
    }
    state.checkedAt = now.toISOString();
    if (!orders.pageInfo.hasNextPage) {
      state.completedAt = now.toISOString();
      state.windowEnd = null;
      state.cursor = null;
      await save(state);
      return state;
    }
    if (
      !orders.pageInfo.endCursor ||
      orders.pageInfo.endCursor === state.cursor
    )
      throw Error("Reconciliation cursor did not advance");
    state.cursor = orders.pageInfo.endCursor;
    await save(state);
  }
  return state;
}
