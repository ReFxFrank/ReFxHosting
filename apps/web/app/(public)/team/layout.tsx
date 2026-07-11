import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: 'Our Team',
  description: 'The people who run ReFx Hosting — who we are, why we build hosting for game communities, and how to reach us directly.',
  path: '/team',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
