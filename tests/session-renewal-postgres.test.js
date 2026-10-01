import test from "node:test";
import process from "node:process";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "@shopify/shopify-app-react-router/adapters/node";
import {
  shopifyApp,
  ApiVersion,
  AppDistribution,
} from "@shopify/shopify-app-react-router/server";
import { Session } from "@shopify/shopify-api";
import { setAbstractFetchFunc } from "@shopify/shopify-api/runtime";
import { createCoordinatedSessionStorage } from "../app/lib/coordinated-session-storage.server.js";

// Explicitly opt into a fresh, disposable local database. Never use a store DB.
test(
  "PostgreSQL coordinates separate SDK clients and rolls back failed renewals",
  { skip: !process.env.SESSION_TEST_DATABASE_URL },
  async () => {
    const url = new URL(process.env.SESSION_TEST_DATABASE_URL);
    assert.equal(url.hostname, "localhost");
    assert.match(url.pathname, /^\/session_renewal_test_[a-z0-9_]+$/);
    const { PrismaClient } = await import(
      process.env.SESSION_TEST_PRISMA_CLIENT || "@prisma/client"
    );
    const clients = [0, 1].map(
      () =>
        new PrismaClient({ datasources: { db: { url: url.href } }, log: [] }),
    );
    try {
      const schema = await readFile(
        new URL(
          "../prisma-postgresql/migrations/20260924000000_initial/migration.sql",
          import.meta.url,
        ),
        "utf8",
      );
      for (const statement of schema.split(";").filter((s) => s.trim()))
        await clients[0].$executeRawUnsafe(statement);
      const shop = "renewal-test.myshopify.com",
        apiKey = "test-app-key";
      const stores = clients.map((prisma) =>
        createCoordinatedSessionStorage(prisma, {
          apiKey,
          databaseUrl: url.href,
        }),
      );
      const apps = stores.map((sessionStorage) =>
        shopifyApp({
          apiKey,
          apiSecretKey: "test-secret",
          apiVersion: ApiVersion.July26,
          appUrl: "https://app.example.com",
          scopes: ["read_customers"],
          sessionStorage,
          distribution: AppDistribution.AppStore,
          future: { expiringOfflineAccessTokens: true },
          logger: { level: 0, log: () => {} },
        }),
      );
      const id = `offline_${shop}`;
      await stores[0].storeSession(
        new Session({
          id,
          shop,
          state: "",
          isOnline: false,
          scope: "read_customers",
          accessToken: "old-access",
          refreshToken: "old-refresh",
          expires: new Date(1000),
          refreshTokenExpires: new Date(Date.now() + 86400000),
        }),
      );
      let refreshes = 0;
      setAbstractFetchFunc(async (_url, init) => {
        refreshes++;
        assert.equal(JSON.parse(init.body).refresh_token, "old-refresh");
        await new Promise((resolve) => setTimeout(resolve, 25));
        return Response.json({
          access_token: "new-access",
          refresh_token: "new-refresh",
          scope: "read_customers",
          expires_in: 86400,
          refresh_token_expires_in: 7776000,
        });
      });
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          stores[i % 2].withShop(shop, () =>
            apps[i % 2].unauthenticated.admin(shop),
          ),
        ),
      );
      assert.equal(refreshes, 1);
      assert.ok(
        results.every((result) => result.session.accessToken === "new-access"),
      );
      assert.equal(
        (await clients[1].session.findUnique({ where: { id } })).refreshToken,
        "new-refresh",
      );
      await clients[0].session.update({
        where: { id },
        data: { expires: new Date(1000) },
      });
      setAbstractFetchFunc(async () =>
        Response.json({ error: "temporary" }, { status: 503 }),
      );
      await assert.rejects(
        stores[0].withShop(shop, () => apps[0].unauthenticated.admin(shop)),
      );
      assert.equal(
        (await clients[1].session.findUnique({ where: { id } })).refreshToken,
        "new-refresh",
      );
      // The failed transaction must release its advisory lock for the other process.
      await stores[1].withShop(shop, async () =>
        assert.equal(
          (await stores[1].loadSession(id)).refreshToken,
          "new-refresh",
        ),
      );
    } finally {
      await Promise.all(clients.map((client) => client.$disconnect()));
    }
  },
);
