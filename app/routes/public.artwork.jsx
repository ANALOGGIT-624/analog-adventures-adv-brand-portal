import { authenticate, unauthenticated } from "../shopify.server";
import { authorizedArtwork } from "../lib/private-artwork-access.server";
import { createPrivateArtworkStorage } from "../lib/private-artwork-storage.server";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export const action = async ({ request }) => {
  const { sessionToken, cors } =
    await authenticate.public.customerAccount(request);
  if (!sessionToken.sub)
    return cors(json({ error: "Sign in to download artwork." }, 401));
  let input;
  try {
    input = await request.json();
  } catch {
    return cors(json({ error: "Invalid download request." }, 400));
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    return cors(json({ error: "Invalid download request." }, 400));
  try {
    const { admin } = await unauthenticated.admin(sessionToken.dest);
    const asset = await authorizedArtwork({
      admin,
      shop: sessionToken.dest,
      customerId: sessionToken.sub,
      kind: input.kind,
      recordId: input.recordId,
    });
    const url = await createPrivateArtworkStorage().downloadUrl(asset);
    return cors(json({ url, expiresIn: 60 }));
  } catch (error) {
    const status = error instanceof Response ? error.status : 503;
    return cors(
      json(
        {
          error:
            status === 404
              ? "Artwork is unavailable."
              : "Artwork download is temporarily unavailable.",
        },
        status,
      ),
    );
  }
};

export const loader = async ({ request }) => {
  const { cors } = await authenticate.public.customerAccount(request);
  return cors(json({ error: "Use a signed-in download request." }, 405));
};
