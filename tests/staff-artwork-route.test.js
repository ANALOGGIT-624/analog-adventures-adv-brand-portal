import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = (await readFile(new URL("../app/routes/app.artwork.jsx", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?;\n/gm, "").replace(/export const /g, "const ");
function route({ authDenied = false, recordDenied = false } = {}) {
  let signed = 0;
  const { loader } = vm.runInNewContext(source + "\n({loader});", {
    URL, Response,
    authenticate: { admin: async () => {
      if (authDenied) throw new Response("Unauthorized", { status: 401 });
      return { admin: {}, session: { shop: "test.myshopify.com" } };
    } },
    authorizedArtwork: async args => {
      assert.equal(args.shop, "test.myshopify.com");
      assert.equal(args.staff, true);
      assert.equal(args.recordId, "gid://shopify/Metaobject/123");
      if (recordDenied) throw new Response("Not found", { status: 404 });
      return { assetId: "private-asset" };
    },
    createPrivateArtworkStorage: () => ({ downloadUrl: async () => {
      signed++;
      return "https://example.r2.cloudflarestorage.com/signed";
    } }),
  });
  return { run: format => loader({ request: new Request(`https://app.test/app/artwork?kind=proof&id=gid://shopify/Metaobject/123&shop=forged.myshopify.com&format=${format}`) }), signed: () => signed };
}
test("staff JSON downloads authenticate, use the session shop, and never cache signed links", async () => {
  const h = route(); const response = await h.run("json");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal((await response.json()).expiresIn, 60);
  assert.equal(h.signed(), 1);
  const legacy = await route().run("redirect");
  assert.equal(legacy.status, 302);
});
test("staff JSON endpoint cannot sign without authentication and authorized record access", async () => {
  const unauthenticated = route({ authDenied: true });
  await assert.rejects(unauthenticated.run("json")); assert.equal(unauthenticated.signed(), 0);
  const denied = route({ recordDenied: true });
  assert.equal((await denied.run("json")).status, 404); assert.equal(denied.signed(), 0);
});
