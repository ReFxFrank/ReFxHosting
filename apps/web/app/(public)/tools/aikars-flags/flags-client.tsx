"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { copyToClipboard } from "@/lib/utils";

/**
 * Canonical Aikar's flags, including the large-heap (>=12 GB) variant with
 * the adjusted G1 new-generation sizing. Kept in lock-step with what ReFx
 * applies to hosted Minecraft servers automatically.
 */
function buildCommand(gb: number, jarName: string): string {
  const large = gb >= 12;
  const flags = [
    `-Xms${gb}G`,
    `-Xmx${gb}G`,
    "-XX:+UseG1GC",
    "-XX:+ParallelRefProcEnabled",
    "-XX:MaxGCPauseMillis=200",
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:+DisableExplicitGC",
    "-XX:+AlwaysPreTouch",
    `-XX:G1NewSizePercent=${large ? 40 : 30}`,
    `-XX:G1MaxNewSizePercent=${large ? 50 : 40}`,
    `-XX:G1HeapRegionSize=${large ? "16M" : "8M"}`,
    `-XX:G1ReservePercent=${large ? 15 : 20}`,
    "-XX:G1HeapWastePercent=5",
    "-XX:G1MixedGCCountTarget=4",
    `-XX:InitiatingHeapOccupancyPercent=${large ? 20 : 15}`,
    "-XX:G1MixedGCLiveThresholdPercent=90",
    "-XX:G1RSetUpdatingPauseTimePercent=5",
    "-XX:SurvivorRatio=32",
    "-XX:+PerfDisableSharedMem",
    "-XX:MaxTenuringThreshold=1",
    "-Dusing.aikars.flags=https://mcflags.emc.gs",
    "-Daikars.new.flags=true",
  ];
  return `java ${flags.join(" ")} -jar ${jarName} nogui`;
}

export function FlagsClient() {
  const [gb, setGb] = useState(8);
  const [jar, setJar] = useState("server.jar");
  const [copied, setCopied] = useState(false);

  const command = buildCommand(gb, jar.trim() || "server.jar");

  async function copy() {
    if (await copyToClipboard(command)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Couldn't copy to clipboard");
    }
  }

  return (
    <div className="refx-card rounded-2xl p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Heap size (GB)</label>
          <Input
            type="number"
            min={1}
            max={64}
            value={gb}
            onChange={(e) => setGb(Math.max(1, Math.min(64, Number(e.target.value) || 1)))}
            aria-label="Heap size in gigabytes"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Leave the OS ~1–2 GB: on a 8 GB server, a 6–7 GB heap is right.
            {gb >= 12 ? " Using the large-heap G1 sizing." : ""}
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Server jar</label>
          <Input
            value={jar}
            onChange={(e) => setJar(e.target.value)}
            placeholder="server.jar"
            aria-label="Server jar file name"
          />
        </div>
      </div>

      <div className="relative mt-5">
        <pre className="overflow-x-auto rounded-xl border border-white/[0.07] bg-black/40 p-4 pr-14 text-xs leading-relaxed text-foreground/90">
          {command}
        </pre>
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={copy}
          className="absolute right-2 top-2"
          aria-label="Copy command"
        >
          {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
