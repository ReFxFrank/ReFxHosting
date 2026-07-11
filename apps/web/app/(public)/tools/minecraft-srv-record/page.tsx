import type { Metadata } from "next";
import { ToolShell } from "@/components/public/tool-shell";
import { pageMetadata } from "@/lib/seo";
import { SrvClient } from "./srv-client";

export const metadata: Metadata = pageMetadata({
  title: "Minecraft SRV record generator",
  description:
    "Generate the _minecraft._tcp SRV record so players join your server with a clean domain and no port. Free DNS record builder with registrar-ready fields.",
  path: "/tools/minecraft-srv-record",
});

const FAQ = [
  {
    q: "What does an SRV record do for a Minecraft server?",
    a: "It maps a domain to a host and port at the DNS level. When someone connects to play.example.com, the Java client first asks DNS for _minecraft._tcp.play.example.com and follows the target and port it finds — so players never have to type a port, even on non-standard ones.",
  },
  {
    q: "Do I still need an A record?",
    a: "The SRV target must be a hostname that resolves (an A/AAAA record or your host's address like node1.example.net) — it cannot point at a bare IP in the record itself. If your host gives you a hostname, point the SRV target straight at it and you don't need any A record of your own.",
  },
  {
    q: "Why isn't my SRV record working?",
    a: "The usual suspects: the record name is missing the _minecraft._tcp prefix, the target is an IP address instead of a hostname, the target has a trailing typo, or DNS just hasn't propagated yet (give it up to an hour). Test with the status checker tool — it follows SRV records exactly like the game.",
  },
  {
    q: "Does Bedrock edition use SRV records?",
    a: "No — SRV lookup is a Java-edition client behavior. Bedrock players need the address and port directly, so keep your Bedrock port in the server listing if you run crossplay via Geyser.",
  },
];

export default function SrvRecordPage() {
  return (
    <ToolShell
      path="/tools/minecraft-srv-record"
      title="Minecraft SRV record generator"
      tagline="Let players join with play.yourdomain.com — no port, any host."
      intro={[
        "Fill in the address you want players to use, where the server actually lives, and its port. You get both the per-field values registrar dashboards ask for (Cloudflare, Namecheap, Porkbun and friends all use the same shape) and the raw zone-file line for anything else.",
        "The generated record uses priority 0 and weight 5 — the conventional values when you have a single server. Multiple SRV records with different priorities can fail over between hosts, but one record is all a typical community server needs.",
      ]}
      faq={FAQ}
      ctaTitle="Want the clean address without the DNS homework?"
      ctaBody="ReFx servers can add a yourname.refx.gg subdomain from the panel — records wired up automatically."
      ctaHref="/games"
      ctaLabel="Browse games"
    >
      <SrvClient />
    </ToolShell>
  );
}
