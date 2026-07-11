import type { Metadata } from "next";
import { ToolShell } from "@/components/public/tool-shell";
import { pageMetadata } from "@/lib/seo";
import { CalculatorClient } from "./calculator-client";

export const metadata: Metadata = pageMetadata({
  title: "Minecraft server RAM calculator",
  description:
    "Work out how much RAM your Minecraft server needs — vanilla, Paper with plugins, or modpacks like ATM10 — based on player count. Honest numbers, free tool.",
  path: "/tools/minecraft-ram-calculator",
});

const FAQ = [
  {
    q: "How much RAM does a vanilla Minecraft server need?",
    a: "2 GB runs a small vanilla server for a handful of friends comfortably. Beyond roughly 10 concurrent players, or with a large view distance, step up to 4 GB.",
  },
  {
    q: "How much RAM do modpacks need?",
    a: "Light packs (up to ~100 mods) want 5-6 GB, mid-size packs 6-8 GB, and kitchen-sink packs like All the Mods 10 or RAD genuinely need 10 GB or more. Modded servers also load hundreds of extra classes and registries at boot, which is why a pack that runs on your PC with 6 GB can still crash a 4 GB server.",
  },
  {
    q: "Is more RAM always better?",
    a: "No. Oversized heaps make Java's garbage collector do rarer but longer sweeps, which shows up as lag spikes. Size the heap to the workload and spend the savings on better CPU — Minecraft's main loop is single-thread bound, so per-core speed usually matters more than RAM past the requirement.",
  },
  {
    q: "Does player count or mod count matter more?",
    a: "Mods set the floor, players set the growth. A heavy pack needs 10 GB before anyone joins; each additional player then adds roughly 100-150 MB on modded servers (about 50 MB on vanilla) for their loaded chunks and entities.",
  },
];

export default function RamCalculatorPage() {
  return (
    <ToolShell
      path="/tools/minecraft-ram-calculator"
      title="Minecraft server RAM calculator"
      tagline="How much memory your server actually needs — without the guesswork."
      intro={[
        "The estimate uses a base heap per server flavor plus a per-player factor, rounded up to common plan sizes. It deliberately leans conservative: the most common mistake in server hosting is putting a 250-mod pack on a 2 GB plan and blaming the pack.",
        "Two things the calculator can't see: view distance (each +2 roughly doubles loaded chunks per player) and world age (entity-heavy farms grow memory over time). If your TPS drops while memory sits near the ceiling, move up a tier; if memory idles half-empty, you can safely size down.",
      ]}
      faq={FAQ}
      ctaTitle="RAM sorted — now pick a plan"
      ctaBody="Dedicated (never oversold) memory, burst CPU, and resizes without reinstalling."
      ctaHref="/games/minecraft"
      ctaLabel="Minecraft plans"
    >
      <CalculatorClient />
    </ToolShell>
  );
}
