import { ogImage, OG_SIZE } from "@/lib/og-template";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "ReFx Hosting — game server hosting";

export default function Image() {
  return ogImage(
    "Game server hosting",
    "Instant setup · switch games anytime · one panel",
  );
}
