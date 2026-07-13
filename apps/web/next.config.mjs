/** @type {import('next').NextConfig} */

// SECURITY (SEC-06): the panel drives billing + full server control and stores
// bearer + refresh tokens in web storage, so it ships defense-in-depth headers.
// The CSP locks object/base/frame vectors and confines default-src to self;
// script/style stay 'unsafe-inline' for now because Next's App Router injects
// inline hydration scripts without nonces — tightening script-src to a
// nonce/'strict-dynamic' policy is the documented follow-up (needs testing
// against the running app). The concrete JSON-LD XSS is fixed at the source
// (lib/json-ld.ts); this is the second layer.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
