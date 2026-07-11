import { PublicLayout } from "@/components/public/public-layout";
import { SITE_URL } from "@/lib/server-api";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

/** WebSite + SearchAction (knowledge-base search) for rich results. */
const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: BRAND,
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/knowledge-base?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

export default function PublicGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
      />
      <PublicLayout>{children}</PublicLayout>
    </>
  );
}
