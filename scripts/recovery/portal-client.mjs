import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApp, ApiVersion, AppDistribution } from "@shopify/shopify-app-react-router/server";
import { queries } from "./queries.mjs";

export const BACKUP_STORE = "analog-adventures-test.myshopify.com";
export const BACKUP_APP = "8158f984f0ec6fed1e5f85b44a588777";

export function createReadOnlyQuery(token, fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  return async (kind, variables = {}) => {
    if (!Object.hasOwn(queries, kind) || !/^query\s/.test(queries[kind])) throw new Error("Unknown backup query");
    for (let attempt = 0; attempt < 5; attempt++) {
      let response, result;
      try {
        response = await fetcher(`https://${BACKUP_STORE}/admin/api/2026-07/graphql.json`, {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(60000),
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
          body: JSON.stringify({ query: queries[kind], variables }),
        });
        result = await response.json();
      } catch { throw new Error("Shopify backup request failed"); }
      if (response.status === 429 || response.status >= 500 || result.errors?.some(e => e.extensions?.code === "THROTTLED")) {
        if (attempt === 4) break;
        await sleep(Math.min(1000 * 2 ** attempt, 16000));
        continue;
      }
      if (!response.ok || result.errors?.length || !result.data) throw new Error("Shopify backup query failed");
      return result.data;
    }
    throw new Error("Shopify backup retry limit reached");
  };
}

export async function createPortalReader(env, sessionStorage) {
  if (env.SHOPIFY_API_KEY !== BACKUP_APP || !env.SHOPIFY_API_SECRET || env.SHOPIFY_APP_URL !== "https://analog-portal-pilot.onrender.com")
    throw new Error("Unexpected backup app identity");
  const app = shopifyApp({
    apiKey: env.SHOPIFY_API_KEY, apiSecretKey: env.SHOPIFY_API_SECRET,
    apiVersion: ApiVersion.July26, scopes: env.SCOPES?.split(","), appUrl: env.SHOPIFY_APP_URL,
    sessionStorage, distribution: AppDistribution.AppStore,
    future: { expiringOfflineAccessTokens: true }, logger: { level: 0, log: () => {} },
  });
  // Official SDK refreshes expiring offline tokens and persists their replacement.
  // No Shopify business-data mutations are exposed to this worker.
  const load = () => app.unauthenticated.admin(BACKUP_STORE);
  const { session } = await (sessionStorage.withShop ? sessionStorage.withShop(BACKUP_STORE, load) : load());
  if (session.shop !== BACKUP_STORE || session.isOnline || session.isExpired()) throw new Error("Backup session unavailable");
  const query = createReadOnlyQuery(session.accessToken);
  const identity = await query("identity");
  if (identity.shop?.myshopifyDomain !== BACKUP_STORE || identity.currentAppInstallation?.app?.apiKey !== BACKUP_APP)
    throw new Error("Shopify backup identity mismatch");
  return query;
}
