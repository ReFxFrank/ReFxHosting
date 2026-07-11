import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: 'Web Hosting for Game Communities',
  description: 'Host your community site, wiki or map viewer next to your game servers — one panel, one invoice, SSL included on every plan.',
  path: '/web-hosting',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
