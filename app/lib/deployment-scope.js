// Explicit deployment identities keep development and live data paths separate.
export const DEVELOPMENT_SCOPE = Object.freeze({
  name: "development", shop: "analog-adventures-test.myshopify.com",
  appId: "8158f984f0ec6fed1e5f85b44a588777", appUrl: "https://analog-portal-pilot.onrender.com",
  artworkBucket: "analog-brand-portal-private", databaseName: "analog_portal_pilot",
  databaseHost: "dpg-daql1l1srm7s73dfn2rg-a",
  backupRoot: "recovery/postgresql/scheduled/", configFile: "shopify.app.render.toml",
});
export const LIVE_SCOPE = Object.freeze({
  name: "live", shop: "16e80f-5b.myshopify.com",
  appId: "06e65ab0c39620391d34ec284f2b61aa", appUrl: "https://analog-portal-live.onrender.com",
  artworkBucket: "analog-brand-portal-live", databaseName: "analog_portal_live",
  backupRoot: "recovery/postgresql/scheduled/live/16e80f-5b/", configFile: "shopify.app.live.toml",
});
export function deploymentScope(env = {}) {
  const name = env.PORTAL_DEPLOYMENT || "development";
  if (name === "development") return DEVELOPMENT_SCOPE;
  if (name === "live") return LIVE_SCOPE;
  throw new Error("Unknown portal deployment");
}
export function requireDeploymentIdentity(env) {
  const scope = deploymentScope(env);
  if (env.SHOPIFY_API_KEY !== scope.appId || env.SHOPIFY_APP_URL !== scope.appUrl)
    throw new Error("Portal deployment identity mismatch");
  return scope;
}
