import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: 'TeamSpeak Voice Server Hosting',
  description: "Low-latency TeamSpeak 3 servers with instant provisioning, web-based administration and per-slot pricing. Your community's voice, on your terms.",
  path: '/voice',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
