import prisma from "../db.server";
import { databasePortalEnabled } from "../lib/portal-records.server.js";

export async function loader() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (databasePortalEnabled()) await prisma.portalRecord.findFirst({ select: { id: true } });
    return new Response("ok", {
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("unavailable", {
      status: 503,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }
}
