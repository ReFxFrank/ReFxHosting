// Apple App Site Association (AASA).
//
// Served at /.well-known/apple-app-site-association so the native iOS app
// (Apple Team ID FM8Z8BA64H, bundle com.refx.app) can use passkeys created on
// refx.gg via the `webcredentials:refx.gg` associated domain. Apple fetches
// this file unauthenticated over HTTPS and requires HTTP 200,
// Content-Type: application/json, and no redirects.
//
// A route handler (rather than a static public/ file) guarantees the exact
// extension-less path and the application/json content type — a public/ file
// with no extension would be served as octet-stream.
//
// `applinks.details` is intentionally empty: the app claims no Universal Link
// paths yet — only shared web credentials (passkeys). Add entries here later if
// the app starts handling https://refx.gg/... deep links.

const APPLE_APP_SITE_ASSOCIATION = {
  webcredentials: {
    apps: ["FM8Z8BA64H.com.refx.app"],
  },
  applinks: {
    details: [],
  },
} as const;

// The association is a constant, so prerender it as a static asset.
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(APPLE_APP_SITE_ASSOCIATION), {
    status: 200,
    headers: {
      // Exactly application/json (no charset) per Apple's AASA requirement.
      "content-type": "application/json",
      // Long-lived but revalidatable; the association rarely changes.
      "cache-control": "public, max-age=3600",
    },
  });
}
