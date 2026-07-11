import type { Metadata } from "next";
import { ToolShell } from "@/components/public/tool-shell";
import { pageMetadata } from "@/lib/seo";
import { FlagsClient } from "./flags-client";

export const metadata: Metadata = pageMetadata({
  title: "Aikar's flags generator",
  description:
    "Generate the tuned JVM startup command for your Minecraft server — Aikar's flags with the correct G1GC sizing for your heap, including the 12 GB+ variant.",
  path: "/tools/aikars-flags",
});

const FAQ = [
  {
    q: "What do Aikar's flags actually do?",
    a: "They tune Java's G1 garbage collector for Minecraft's allocation pattern: lots of short-lived objects per tick. The flags size the young generation aggressively and pace collection so the GC works in small, frequent steps instead of long world-freezing pauses.",
  },
  {
    q: "Why do the flags change at 12 GB?",
    a: "Large heaps shift the trade-offs: the standard settings leave too much old-generation churn, so the 12 GB+ variant raises G1NewSizePercent to 40, uses 16M heap regions and starts concurrent collection earlier. The generator switches automatically at your heap size.",
  },
  {
    q: "Should -Xms and -Xmx be equal?",
    a: "Yes, for servers. Equal minimum and maximum heap plus AlwaysPreTouch means the memory is claimed and paged in at boot, avoiding allocation stalls later. This is the opposite of desktop-Java advice, which is why it surprises people.",
  },
  {
    q: "Do these flags work for Forge and Fabric servers?",
    a: "Yes — they're loader-agnostic JVM settings. Point the command at your loader's jar (or run file) and keep the heap honest: modded servers need the RAM first, flags second. Flags tune GC behavior; they don't create memory.",
  },
];

export default function AikarsFlagsPage() {
  return (
    <ToolShell
      path="/tools/aikars-flags"
      title="Aikar's flags generator"
      tagline="The community-standard JVM tuning for Minecraft servers, sized to your heap."
      intro={[
        "Aikar's flags are the de-facto standard startup settings for Minecraft servers, developed by the Paper project's community from real GC logs. The generator emits the current canonical set with the correct G1 sizing for your heap — including the variant that kicks in at 12 GB and above.",
        "One honest caveat: flags are the last 10%, not a fix for an undersized server. If you're fighting lag, verify RAM and single-core CPU speed first (the RAM calculator is one tab over), then apply tuned flags for smoother pacing.",
      ]}
      faq={FAQ}
      ctaTitle="Skip the startup-script maintenance"
      ctaBody="ReFx Minecraft servers apply tuned memory flags automatically, derived from your plan size."
      ctaHref="/games/minecraft"
      ctaLabel="Minecraft plans"
    >
      <FlagsClient />
    </ToolShell>
  );
}
