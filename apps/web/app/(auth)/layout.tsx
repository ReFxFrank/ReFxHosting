import Link from "next/link";
import { LogoWordmark } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center">
            <LogoWordmark height={30} />
          </Link>
          {children}
        </div>
      </div>
      <div className="refx-beam relative hidden overflow-hidden border-l border-white/[0.06] bg-[linear-gradient(160deg,rgba(15,24,40,0.96),rgba(7,11,18,0.98))] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(900px_600px_at_25%_10%,rgba(0,114,255,0.22),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(700px_500px_at_90%_90%,rgba(88,167,211,0.12),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <blockquote className="max-w-md space-y-3">
            <p className="refx-eyebrow">ReFx Hosting</p>
            <p className="text-2xl font-semibold leading-snug tracking-tight text-[hsl(213_100%_97%)]">
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
