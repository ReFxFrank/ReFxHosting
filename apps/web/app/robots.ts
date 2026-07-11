import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/server-api";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Authenticated app surfaces have no business in an index.
        disallow: [
          "/dashboard",
          "/servers",
          "/billing",
          "/account",
          "/admin",
          "/support",
          "/login",
          "/register",
          "/auth/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
