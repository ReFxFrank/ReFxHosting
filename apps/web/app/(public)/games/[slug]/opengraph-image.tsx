import { ogImage, OG_SIZE } from "@/lib/og-template";
import { serverGet } from "@/lib/server-api";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Game server hosting";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await serverGet<{ game: { name: string } }>(
    `/catalog/games/${slug}`,
    3600,
  );
  const name = detail?.game?.name ?? "Game";
  return ogImage(
    `${name} server hosting`,
    "Instant setup · full control panel · DDoS protected",
  );
}
