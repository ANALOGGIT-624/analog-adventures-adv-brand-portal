import { authenticate } from "../shopify.server";
import { authorizedArtwork } from "../lib/private-artwork-access.server";
import { createPrivateArtworkStorage } from "../lib/private-artwork-storage.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const params = new URL(request.url).searchParams;
  try {
    const asset = await authorizedArtwork({
      admin,
      shop: session.shop,
      staff: true,
      kind: params.get("kind"),
      recordId: params.get("id"),
    });
    const url = await createPrivateArtworkStorage().downloadUrl(asset);
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response("Artwork download is temporarily unavailable.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
};
