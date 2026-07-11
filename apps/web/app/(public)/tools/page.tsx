import Link from "next/link";
import type { Metadata } from "next";
import { Activity, ArrowRight, Cpu, Globe, MemoryStick } from "lucide-react";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Free Minecraft server tools",
  description:
    "Free tools for server owners: live Minecraft status checker, RAM calculator, Aikar's flags generator and SRV record builder. No signup required.",
  path: "/tools",
});

const TOOLS = [
  {
    href: "/tools/minecraft-server-status",
    icon: Activity,
    title: "Server status checker",
    description:
      "Live status for any Java-edition server — players online, version, MOTD and ping. Follows SRV records like the real client.",
  },
  {
    href: "/tools/minecraft-ram-calculator",
    icon: MemoryStick,
    title: "RAM calculator",
    description:
      "How much memory your server needs, from vanilla to kitchen-sink modpacks, based on player count and honest sizing.",
  },
  {
    href: "/tools/aikars-flags",
    icon: Cpu,
    title: "Aikar's flags generator",
    description:
      "The community-standard JVM startup command, with the correct G1GC sizing for your heap — including the 12 GB+ variant.",
  },
  {
    href: "/tools/minecraft-srv-record",
    icon: Globe,
    title: "SRV record generator",
    description:
      "Let players join with a clean domain and no port. Registrar-ready fields plus the raw zone-file line.",
  },
];

export default function ToolsHubPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
      <div className="max-w-2xl">
        <p className="refx-eyebrow mb-3">Free tools</p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
          Server owner <span className="refx-text-gradient">toolbox</span>
        </h1>
        <p className="mt-4 text-muted-foreground">
          Small, fast utilities we built for our own support work — free for
          everyone, no signup. They pair with the step-by-step guides in the
          knowledge base.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="refx-card group flex flex-col gap-3 rounded-2xl p-5 transition-colors hover:bg-white/[0.03]"
          >
            <span className="flex size-10 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03]">
              <tool.icon className="size-5 text-muted-foreground" />
            </span>
            <h2 className="font-semibold">{tool.title}</h2>
            <p className="text-sm text-muted-foreground">{tool.description}</p>
            <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              Open tool <ArrowRight className="size-4" />
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        Missing a tool you&apos;d use?{" "}
        <Link href="/support" className="underline hover:text-foreground">
          Tell us
        </Link>{" "}
        — the toolbox grows from real requests.
      </p>
    </div>
  );
}
