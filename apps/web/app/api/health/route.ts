// Liveness probe for the web container. Used by the platform status feed
// (panel-api pings this to report "Web Dashboard" health) and by orchestrators.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, service: "web" });
}
