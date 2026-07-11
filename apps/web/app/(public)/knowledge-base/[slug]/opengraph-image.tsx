import { ogImage, OG_SIZE } from "@/lib/og-template";
import { serverGet } from "@/lib/server-api";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "ReFx Hosting knowledge base";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await serverGet<{ title: string }>(
    `/support/kb/${slug}`,
    3600,
  );
  return ogImage(article?.title ?? "Knowledge base", "Guides from real support cases");
}
