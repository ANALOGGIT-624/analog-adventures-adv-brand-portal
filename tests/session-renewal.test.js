import test from "node:test";
import assert from "node:assert/strict";
import "@shopify/shopify-app-react-router/adapters/node";
import {
  shopifyApp,
  ApiVersion,
  AppDistribution,
} from "@shopify/shopify-app-react-router/server";
import { Session } from "@shopify/shopify-api";
import { setAbstractFetchFunc } from "@shopify/shopify-api/runtime";
import {
  createCoordinatedSessionStorage,
  coordinateShopifyAuthentication,
} from "../app/lib/coordinated-session-storage.server.js";

const shop = "renewal-test.myshopify.com";
const apiKey = "test-app-key";
function expiredSession() {
  return new Session({
    id: `offline_${shop}`,
    shop,
    state: "",
    isOnline: false,
    scope: "read_customers",
    accessToken: "old-access",
    expires: new Date(0),
    refreshToken: "old-refresh",
    refreshTokenExpires: new Date(Date.now() + 86400000),
  });
}
function database(initial = expiredSession()) {
  let current = initial,
    tail = Promise.resolve();
  const session = {
    async load() {
      return current && new Session(current.toObject());
    },
    async save(s) {
      current = new Session(s.toObject());
      return true;
    },
  };
  const db = {
    session,
    async $transaction(task) {
      let unlock;
      try {
        return await task({
          session,
          $executeRaw: async () => 0,
          $queryRaw: async () => {
            const prior = tail;
            tail = new Promise((resolve) => {
              unlock = resolve;
            });
            await prior;
            return [];
          },
        });
      } finally {
        unlock?.();
      }
    },
  };
  const baseStorage = {
    prisma: db,
    loadSession() {
      return this.prisma.session.load();
    },
    storeSession(s) {
      return this.prisma.session.save(s);
    },
  };
  const storage = () =>
    createCoordinatedSessionStorage(db, {
      apiKey,
      databaseUrl: "postgresql://test",
      baseStorage,
    });
  return { db, storage, current: () => session.load() };
}
function app(storage) {
  return shopifyApp({
    apiKey,
    apiSecretKey: "test-secret",
    apiVersion: ApiVersion.July26,
    appUrl: "https://app.example.com",
    scopes: ["read_customers"],
    sessionStorage: storage,
    distribution: AppDistribution.AppStore,
    future: { expiringOfflineAccessTokens: true },
    logger: { level: 0, log: () => {} },
  });
}

// Run the installed SDK's actual rotating-token refresh against two independent
// coordinators (web/worker), using a fake OAuth server that consumes each token.
test("concurrent web and backup SDK clients refresh exactly once and share the saved replacement", async () => {
  const db = database(),
    web = db.storage(),
    worker = db.storage();
  const apps = [app(web), app(worker)];
  let requests = 0;
  setAbstractFetchFunc(async (_url, init) => {
    requests++;
    assert.equal(JSON.parse(init.body).refresh_token, "old-refresh");
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json({
      access_token: "new-access",
      refresh_token: "new-refresh",
      scope: "read_customers",
      expires_in: 86400,
      refresh_token_expires_in: 7776000,
    });
  });
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) => {
      const storage = i % 2 ? worker : web;
      return storage.withShop(shop, () =>
        apps[i % 2].unauthenticated.admin(shop),
      );
    }),
  );
  assert.equal(requests, 1);
  assert.ok(results.every((r) => r.session.accessToken === "new-access"));
  assert.equal((await db.current()).refreshToken, "new-refresh");
});

test("a failed renewal preserves credentials and a later unattended request can recover", async () => {
  const db = database(),
    storage = db.storage(),
    sdk = app(storage);
  setAbstractFetchFunc(async () =>
    Response.json({ error: "temporary" }, { status: 503 }),
  );
  await assert.rejects(
    storage.withShop(shop, () => sdk.unauthenticated.admin(shop)),
    (error) => error instanceof Response && error.status === 500,
  );
  assert.equal((await db.current()).refreshToken, "old-refresh");
  setAbstractFetchFunc(async () =>
    Response.json({
      access_token: "recovered",
      refresh_token: "replacement",
      scope: "read_customers",
      expires_in: 86400,
      refresh_token_expires_in: 7776000,
    }),
  );
  const result = await storage.withShop(shop, () =>
    sdk.unauthenticated.admin(shop),
  );
  assert.equal(result.session.accessToken, "recovered");
});

test("an invalidated access token can be refreshed without staff opening the app", async () => {
  const initial = expiredSession();
  initial.accessToken = undefined;
  initial.expires = new Date(Date.now() + 86400000);
  const db = database(initial),
    storage = db.storage(),
    sdk = app(storage);
  let requests = 0;
  setAbstractFetchFunc(async () => {
    requests++;
    return Response.json({
      access_token: "recovered",
      refresh_token: "replacement",
      scope: "read_customers",
      expires_in: 86400,
      refresh_token_expires_in: 7776000,
    });
  });
  assert.equal(
    (await storage.withShop(shop, () => sdk.unauthenticated.admin(shop)))
      .session.accessToken,
    "recovered",
  );
  assert.equal(requests, 1);
});

test("late invalidation of an older token cannot erase a newly renewed session", async () => {
  const db = database(),
    storage = db.storage();
  const stale = await storage.loadSession(`offline_${shop}`);
  const replacement = expiredSession();
  replacement.accessToken = "new-access";
  replacement.refreshToken = "new-refresh";
  await storage.storeSession(replacement);
  stale.accessToken = undefined;
  await storage.storeSession(stale);
  assert.equal((await db.current()).accessToken, "new-access");
  assert.equal((await db.current()).refreshToken, "new-refresh");
});

test("staff authentication uses the verified token shop lock and still invokes SDK authentication", async () => {
  const calls = [];
  const raw = {
    authenticate: {
      admin: async () => {
        calls.push("authenticate");
        return "staff";
      },
      public: {},
    },
    unauthenticated: { admin: async (s) => s },
  };
  const storage = {
    withShop: async (s, task) => {
      calls.push(s);
      return task();
    },
  };
  const result = coordinateShopifyAuthentication(
    raw,
    storage,
    async (token) => {
      assert.equal(token, "signed");
      return { dest: `https://${shop}` };
    },
  );
  const request = new Request(
    `https://app.example.com/app?shop=attacker.myshopify.com`,
    { headers: { Authorization: "Bearer signed" } },
  );
  assert.equal(await result.authenticate.admin(request), "staff");
  assert.deepEqual(calls, [shop, "authenticate"]);
  assert.equal(await result.unauthenticated.admin(`https://${shop}/`), shop);
});

test("invalid and missing staff tokens follow SDK rejection/bootstrap without acquiring a tenant lock", async () => {
  let calls = 0;
  const rejection = new Response(null, { status: 401 });
  const wrapped = coordinateShopifyAuthentication(
    {
      authenticate: {
        admin: async () => {
          calls++;
          throw rejection;
        },
      },
      unauthenticated: {},
    },
    {
      withShop: () =>
        assert.fail("unverified token must not acquire tenant lock"),
    },
    async () => {
      throw Error("Invalid token");
    },
  );
  for (const request of [
    new Request("https://app.example.com/app"),
    new Request("https://app.example.com/app", {
      headers: { Authorization: "Bearer forged" },
    }),
  ]) {
    await assert.rejects(
      wrapped.authenticate.admin(request),
      (e) => e === rejection,
    );
  }
  assert.equal(calls, 2);
});
