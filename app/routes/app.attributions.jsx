import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
      query AttributedOrders {
        orders(first: 50, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
            createdAt
            displayFinancialStatus
            attribution: metafield(key: "attribution_manifest") { jsonValue }
            attributionStatus: metafield(key: "attribution_status") { value }
          }
        }
      }
    `,
  );
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map(({ message }) => message).join("; "));
  }

  return {
    orders: payload.data.orders.nodes
      .filter(({ attribution }) => attribution?.jsonValue)
      .map((order) => ({
        ...order,
        attribution: order.attribution.jsonValue,
        attributionStatus: order.attributionStatus?.value || "unknown",
      })),
  };
};

export default function AttributedOrders() {
  const { orders } = useLoaderData();

  return (
    <s-page
      heading="Attributed orders"
      subheading="Orders whose organization campaign tokens passed server verification."
    >
      <s-section heading="Recent verified orders">
        {orders.length === 0 ? (
          <s-banner heading="No attributed orders yet" tone="info">
            Complete a test purchase from an organization micro-store after the
            orders/create webhook is active.
          </s-banner>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Order</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Campaign</s-table-header>
              <s-table-header>Attributed units</s-table-header>
              <s-table-header>Created</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {orders.map((order) => {
                const lines = order.attribution?.lines || [];
                const campaigns = [
                  ...new Set(lines.map(({ campaignHandle }) => campaignHandle)),
                ].join(", ");
                const units = lines.reduce(
                  (total, { quantity }) => total + Number(quantity || 0),
                  0,
                );
                return (
                  <s-table-row key={order.id}>
                    <s-table-cell>{order.name}</s-table-cell>
                    <s-table-cell>
                      <s-badge tone="success">
                        {order.attributionStatus}
                      </s-badge>
                    </s-table-cell>
                    <s-table-cell>{campaigns}</s-table-cell>
                    <s-table-cell>{units}</s-table-cell>
                    <s-table-cell>
                      {new Date(order.createdAt).toLocaleString()}
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
