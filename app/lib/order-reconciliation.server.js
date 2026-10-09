import process from "node:process";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { reconcileOrder } from "./order-attribution.server";
import { reconcileBatch } from "./order-reconciliation";
const id = "internal:order-reconciliation";
const shop = "analog-adventures-test.myshopify.com";
let running = false;
export async function reconciliationStatus() {
  const row = await prisma.portalRecord.findUnique({
    where: { shop_id: { shop, id } },
  });
  return row ? JSON.parse(row.values) : null;
}
export async function runOrderReconciliation() {
  if (running) return { busy: true };
  running = true;
  try {
    const { admin } = await unauthenticated.admin(shop);
    return await reconcileBatch({
      admin,
      load: reconciliationStatus,
      save: (state) =>
        prisma.portalRecord.upsert({
          where: { shop_id: { shop, id } },
          create: {
            shop,
            id,
            type: "internal:order-reconciliation",
            handle: id,
            displayName: "Order reconciliation",
            values: JSON.stringify(state),
          },
          update: { values: JSON.stringify(state) },
        }),
      processOrder: (payload) =>
        reconcileOrder({ admin, payload, shop, recovery: true }),
    });
  } finally {
    running = false;
  }
}
// Runs within the existing single-instance paid pilot web service. PostgreSQL
// persists the cursor across restarts; no public endpoint or extra service key.
export function startOrderReconciliation() {
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.PORTAL_DATA_BACKEND !== "postgresql" ||
    process.env.SHOPIFY_APP_URL !== "https://analog-portal-pilot.onrender.com"
  )
    return;
  const tick = () =>
    runOrderReconciliation()
      .then((s) =>
        console.log(
          JSON.stringify({
            orderReconciliation: true,
            busy: !!s.busy,
            scanned: s.scanned,
            review: s.issues?.length,
          }),
        ),
      )
      .catch(() =>
        console.error("Order reconciliation failed; credentials suppressed"),
      );
  setTimeout(tick, 30000).unref();
  setInterval(tick, 15 * 60 * 1000).unref();
}
