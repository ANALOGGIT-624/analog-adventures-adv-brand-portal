import "@shopify/ui-extensions";

// @ts-expect-error generated extension globals
declare module "./src/PortalPage.jsx" {
  const shopify: import("@shopify/ui-extensions/customer-account.page.render").Api;
  const globalThis: { shopify: typeof shopify };
}
