import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: 'Discord Bot Hosting',
  description: 'Run your Discord bot 24/7 with crash auto-restart, live console and file access. Deploy from the same panel as your game servers.',
  path: '/bots',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
