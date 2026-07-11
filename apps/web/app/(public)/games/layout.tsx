import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: 'Game Server Hosting — 40+ games',
  description: 'Browse every game we host: Minecraft, Palworld, Rust, Valheim, ARK and 35 more. Instant setup, transparent pricing, and the freedom to switch games anytime.',
  path: '/games',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
