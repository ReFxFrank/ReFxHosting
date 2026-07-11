import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: 'Knowledge Base — guides and fixes',
  description: 'Setup guides, crash fixes and how-tos for Minecraft, Palworld, Rust and every game we host — written from real support cases.',
  path: '/knowledge-base',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
