"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { copyToClipboard } from "@/lib/utils";

/**
 * Builds the `_minecraft._tcp` SRV record that lets Java-edition players
 * join via a clean domain with no port. Shows both the per-field form most
 * registrar UIs want and the raw zone-file line.
 */
export function SrvClient() {
  const [domain, setDomain] = useState("play.example.com");
  const [target, setTarget] = useState("");
  const [port, setPort] = useState("25565");
  const [copied, setCopied] = useState(false);

  const cleanDomain = domain.trim().toLowerCase().replace(/\.$/, "");
  const cleanTarget = target.trim().toLowerCase().replace(/\.$/, "");
  const portNum = Math.max(1, Math.min(65535, Number(port) || 25565));

  // Registrars want the subdomain part relative to the zone; assume the zone
  // is the last two labels (the common case) and show the FQDN form too.
  const labels = cleanDomain.split(".");
  const sub = labels.length > 2 ? labels.slice(0, -2).join(".") : "@";
  const name = sub === "@" ? "_minecraft._tcp" : `_minecraft._tcp.${sub}`;
  const zoneLine = `_minecraft._tcp.${cleanDomain}. 3600 IN SRV 0 5 ${portNum} ${cleanTarget || "your-server-address"}.`;
  const ready = cleanDomain.includes(".") && cleanTarget.includes(".");

  async function copy() {
    if (await copyToClipboard(zoneLine)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Couldn't copy to clipboard");
    }
  }

  return (
    <div className="refx-card rounded-2xl p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Address players type</label>
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="play.example.com"
            aria-label="Domain players will connect with"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Your server address</label>
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="node1.host.com"
            aria-label="Server hostname"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Server port</label>
          <Input
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => setPort(e.target.value)}
            aria-label="Server port"
          />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-white/[0.07]">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.07] text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Field</th>
              <th className="px-4 py-3 font-semibold">Value</th>
            </tr>
          </thead>
          <tbody className="[&_td]:px-4 [&_td]:py-2.5">
            <tr className="border-b border-white/[0.04]">
              <td className="text-muted-foreground">Type</td>
              <td className="font-mono text-xs">SRV</td>
            </tr>
            <tr className="border-b border-white/[0.04]">
              <td className="text-muted-foreground">Name / Host</td>
              <td className="font-mono text-xs">{name}</td>
            </tr>
            <tr className="border-b border-white/[0.04]">
              <td className="text-muted-foreground">Priority</td>
              <td className="font-mono text-xs">0</td>
            </tr>
            <tr className="border-b border-white/[0.04]">
              <td className="text-muted-foreground">Weight</td>
              <td className="font-mono text-xs">5</td>
            </tr>
            <tr className="border-b border-white/[0.04]">
              <td className="text-muted-foreground">Port</td>
              <td className="font-mono text-xs">{portNum}</td>
            </tr>
            <tr>
              <td className="text-muted-foreground">Target</td>
              <td className="font-mono text-xs">
                {cleanTarget || <span className="text-muted-foreground">your server address</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="relative mt-4">
        <pre className="overflow-x-auto rounded-xl border border-white/[0.07] bg-black/40 p-4 pr-14 text-xs leading-relaxed text-foreground/90">
          {zoneLine}
        </pre>
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={copy}
          disabled={!ready}
          className="absolute right-2 top-2"
          aria-label="Copy zone-file line"
        >
          {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Players then connect with just {cleanDomain || "your domain"} — no port.
        DNS changes can take up to an hour to propagate.
      </p>
    </div>
  );
}
