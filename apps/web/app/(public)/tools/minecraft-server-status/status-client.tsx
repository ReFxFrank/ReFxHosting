"use client";

import { useState } from "react";
import { Loader2, Search, Signal, Users } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = Awaited<ReturnType<typeof api.tools.minecraftStatus>>;

export function StatusClient() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = address.trim();
    if (!trimmed || loading) return;
    // Accept host or host:port.
    const m = trimmed.match(/^(.*?)(?::(\d{1,5}))?$/);
    const host = (m?.[1] ?? trimmed).trim();
    const port = m?.[2] ? Number(m[2]) : undefined;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.tools.minecraftStatus(host, port));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Too many checks from your connection — wait a minute and try again."
          : "The check failed — try again in a moment.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="refx-card rounded-2xl p-5">
      <form onSubmit={check} className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="play.example.com or mc.example.com:25566"
          aria-label="Server address"
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !address.trim()}>
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Check status
        </Button>
      </form>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {result && !result.online && (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <Badge variant="destructive">Offline</Badge>
          <p className="text-sm text-muted-foreground">
            {result.reason ?? "Server is offline or unreachable"} —{" "}
            <span className="text-foreground/80">
              {result.host}
              {result.port !== 25565 ? `:${result.port}` : ""}
            </span>
          </p>
        </div>
      )}

      {result?.online && (
        <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-start gap-4">
            {result.favicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.favicon}
                alt=""
                className="size-14 shrink-0 rounded-lg border border-white/[0.08]"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15">
                  Online
                </Badge>
                {result.version && (
                  <span className="text-xs text-muted-foreground">{result.version}</span>
                )}
                {typeof result.latencyMs === "number" && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Signal className="size-3.5" /> {result.latencyMs} ms
                  </span>
                )}
              </div>
              {result.motd && (
                <p className="mt-2 break-words text-sm text-foreground/90">{result.motd}</p>
              )}
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="size-4" />
                {result.players?.online ?? 0} / {result.players?.max ?? 0} players
              </p>
              {result.players && result.players.sample.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {result.players.sample.map((name) => (
                    <span
                      key={name}
                      className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
