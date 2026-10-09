import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { shopifyApi } from "@shopify/shopify-api";
import {
  createCoordinatedSessionStorage,
  coordinateShopifyAuthentication,
} from "./lib/coordinated-session-storage.server.js";
import prisma from "./db.server";

const storage = createCoordinatedSessionStorage(prisma, {
  apiKey: process.env.SHOPIFY_API_KEY,
  databaseUrl: process.env.DATABASE_URL,
});

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: storage,
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
const tokenVerifier = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  hostName: new URL(process.env.SHOPIFY_APP_URL).host,
  isEmbeddedApp: true,
  logger: { level: 0 },
});
const coordinated = coordinateShopifyAuthentication(
  shopify,
  storage,
  tokenVerifier.session.decodeSessionToken,
  tokenVerifier.webhooks.validate,
);
export const authenticate = coordinated.authenticate;
export const unauthenticated = coordinated.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
