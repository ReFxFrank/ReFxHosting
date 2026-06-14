import Link from "next/link";
import { Boxes } from "lucide-react";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Boxes className="size-5" />
            </div>
            <span className="text-lg font-semibold">{BRAND}</span>
          </Link>
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden border-l bg-gradient-to-br from-primary/15 via-background to-background lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.18),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <blockquote className="max-w-md space-y-3">
            <p className="text-2xl font-medium leading-snug">
              Buy a slot once. Switch games whenever you want.
            </p>
            <p className="text-sm text-muted-foreground">
              Minecraft today, Rust tomorrow, Palworld next week — same server, same
              backups, same plan. The GPortal-style way to host.
            </p>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
