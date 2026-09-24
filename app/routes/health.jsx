import prisma from "../db.server";

export async function loader() {
  try {
    await prisma.$queryRaw`SELECT 1`;
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
