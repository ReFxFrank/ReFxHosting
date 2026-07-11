import type { Metadata } from "next";
import { ToolShell } from "@/components/public/tool-shell";
import { pageMetadata } from "@/lib/seo";
import { StatusClient } from "./status-client";

export const metadata: Metadata = pageMetadata({
  title: "Minecraft server status checker",
  description:
    "Check any Minecraft server's live status: online players, version, MOTD and ping. Free, no signup — works with custom ports and SRV records.",
  path: "/tools/minecraft-server-status",
});

const FAQ = [
  {
    q: "How does the checker work?",
    a: "It performs the same Server List Ping your Minecraft client uses on the multiplayer screen: a real TCP handshake with the server that returns its version, player count, MOTD and icon. Nothing is installed on or sent to the server beyond that standard status request.",
  },
  {
    q: "Why does my server show offline when I can join it?",
    a: "Three usual causes: the server only allows specific IPs through a firewall, it runs on a custom port you didn't include (use host:port), or it's a Bedrock server — this tool speaks the Java-edition protocol. Cracked/offline-mode servers still respond to status pings, so auth mode is not a factor.",
  },
  {
    q: "Does it support SRV records and custom ports?",
    a: "Yes. A bare domain is first looked up as an SRV record (_minecraft._tcp), exactly like the vanilla client, and you can force a port with the host:port form.",
  },
  {
    q: "Why is the player list incomplete or hidden?",
    a: "The status protocol lets servers choose what to expose. Many large servers hide the sample list or replace it with marketing text, and most cap it at a dozen names — that's server-side behavior, not a checker limitation.",
  },
];

export default function StatusToolPage() {
  return (
    <ToolShell
      path="/tools/minecraft-server-status"
      title="Minecraft server status checker"
      tagline="Live status for any Java-edition server: players, version, MOTD, ping."
      intro={[
        "Paste a server address to see exactly what the multiplayer screen would show — whether it's online, how many players are on, what version it runs and its message of the day. It understands SRV records, so clean domains without a port work the same way they do in the game.",
        "If you run the server yourself, this is the quickest way to confirm it's reachable from the internet rather than just from your own network — a classic gotcha after moving hosts or changing firewall rules.",
      ]}
      faq={FAQ}
      ctaTitle="Tired of checking whether your server is up?"
      ctaBody="ReFx servers restart themselves after crashes and show live player counts right in the panel."
      ctaHref="/games/minecraft"
      ctaLabel="Host with us"
    >
      <StatusClient />
    </ToolShell>
  );
}
