import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";

export function sessionShop(value) {
  const shop = String(value || "")
    .replace(/^https:\/\//, "")
    .replace(/\/$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error("Invalid session shop");
  }
  return shop;
}

// The SDK performs token refresh as load -> network request -> store. Keep that
// entire sequence under one lock shared by the web app and backup worker. Row
// locking alone cannot protect the first token exchange when no row exists yet.
export function createCoordinatedSessionStorage(
  prisma,
  { apiKey, databaseUrl, baseStorage = new PrismaSessionStorage(prisma) } = {},
) {
  const context = new AsyncLocalStorage();
  const loadedTokens = new WeakMap();
  const localQueues = new Map();
  const postgres = /^postgres(ql)?:/.test(databaseUrl || "");
  if (!apiKey)
    throw new Error("App identity required for session coordination");

  function adapter() {
    const scoped = Object.create(baseStorage);
    scoped.prisma = context.getStore()?.db || prisma;
    return scoped;
  }
  async function withShop(destination, task) {
    const shop = sessionShop(destination);
    const active = context.getStore();
    if (active) {
      if (active.shop !== shop) throw new Error("Session shop mismatch");
      return task();
    }
    if (postgres) {
      return prisma.$transaction(
        async (db) => {
          // Bound contention independently from the network operation. A failed
          // renewal rolls back without deleting the prior refresh credential.
          await db.$executeRaw`SET LOCAL lock_timeout = '15s'`;
          await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`shopify-session:${apiKey}:${shop}`}, 0))::text`;
          return context.run({ shop, db }, task);
        },
        { maxWait: 20000, timeout: 60000 },
      );
    }
    // SQLite is used only by the single-process local development server.
    const previous = localQueues.get(shop) || Promise.resolve();
    let release;
    const tail = new Promise((resolve) => {
      release = resolve;
    });
    localQueues.set(shop, tail);
    await previous;
    try {
      return await context.run({ shop, db: prisma }, task);
    } finally {
      release();
      if (localQueues.get(shop) === tail) localQueues.delete(shop);
    }
  }
  const storage = {
    withShop,
    async loadSession(id) {
      const session = await adapter().loadSession(id);
      if (session && !session.isOnline) {
        loadedTokens.set(session, {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
        });
        // SDK invalidation can clear an access token while leaving a usable
        // refresh token. Ensure unattended customers can renew that session too.
        if (!session.accessToken && session.refreshToken)
          session.expires = new Date(0);
      }
      return session;
    },
    async storeSession(session) {
      if (session.isOnline) return adapter().storeSession(session);
      return withShop(session.shop, async () => {
        const observed = loadedTokens.get(session);
        if (observed) {
          const current = await adapter().loadSession(session.id);
          if (
            !current ||
            current.accessToken !== observed.accessToken ||
            current.refreshToken !== observed.refreshToken
          ) {
            // A late API 401 must not erase a token another request just renewed.
            return true;
          }
        }
        return adapter().storeSession(session);
      });
    },
    deleteSession: (id) => adapter().deleteSession(id),
    deleteSessions: (ids) => adapter().deleteSessions(ids),
    findSessionsByShop: (shop) => adapter().findSessionsByShop(shop),
    isReady: () => baseStorage.isReady(),
  };
  return storage;
}

export function coordinateShopifyAuthentication(
  app,
  storage,
  decodeSessionToken,
) {
  return {
    authenticate: {
      ...app.authenticate,
      async admin(request) {
        const header = request.headers.get("Authorization") || "";
        const token =
          header.replace(/^Bearer\s+/i, "") ||
          new URL(request.url).searchParams.get("id_token");
        let shop;
        if (token) {
          try {
            shop = sessionShop((await decodeSessionToken(token)).dest);
          } catch {
            /* The SDK must issue its normal authentication response. */
          }
        }
        if (!shop) return app.authenticate.admin(request);
        // Decoding only selects the lock. The SDK still authenticates the request.
        return storage.withShop(shop, () => app.authenticate.admin(request));
      },
    },
    unauthenticated: {
      ...app.unauthenticated,
      admin: (destination) => {
        const shop = sessionShop(destination);
        return storage.withShop(shop, () => app.unauthenticated.admin(shop));
      },
    },
  };
}
