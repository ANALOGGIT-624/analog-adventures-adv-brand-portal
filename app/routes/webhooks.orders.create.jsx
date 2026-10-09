import { authenticate } from "../shopify.server";
import { reconcileOrder } from "../lib/order-attribution.server";

export const action = async ({ request }) => {
  const { admin, payload, shop } = await authenticate.webhook(request);
  if (!admin)
    return new Response("Order processing temporarily unavailable", {
      status: 503,
    });
  await reconcileOrder({ admin, payload, shop });
  return new Response();
};
