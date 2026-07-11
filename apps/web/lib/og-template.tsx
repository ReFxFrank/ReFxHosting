import { ImageResponse } from "next/og";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * Branded OG image: dark navy field with the site's radial glow, wordmark,
 * page title and a subline. Used by every marketing surface so shares look
 * consistent; system font keeps it dependency-free.
 */
export function ogImage(title: string, subline: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background:
            "radial-gradient(80% 90% at 50% -10%, #10336b 0%, #0a1830 45%, #060b16 100%)",
          color: "#eaf2ff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: "#2f7dff",
              boxShadow: "0 0 34px #2f7dff",
            }}
          />
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>
            {BRAND}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: title.length > 42 ? 56 : 68,
              fontWeight: 800,
              letterSpacing: -1.5,
              lineHeight: 1.05,
              maxWidth: 980,
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 28, color: "#9db4d8" }}>{subline}</div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
