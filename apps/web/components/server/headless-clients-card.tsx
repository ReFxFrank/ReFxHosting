"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Minus, Plus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { formatMoney } from "@/lib/utils";
import type { Server } from "@/lib/types";

/**
 * Paid Arma 3 headless-clients add-on: pick 0–3 HC processes that run inside
 * the server's own resources to offload AI (Antistasi/Liberation-style
 * missions). Billed per client per month on the next renewal invoice; applied
 * to the server on the next restart. Owner-only server-side (it changes what
 * the owner pays) — other members get a clear error from the API.
 */
export function HeadlessClientsCard({ server }: { server: Server }) {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ["headless-clients", server.id],
    queryFn: () => api.servers.headlessClients(server.id),
  });
  const [draft, setDraft] = useState<number | null>(null);

  const save = useMutation({
    mutationFn: (count: number) =>
      api.servers.setHeadlessClients(server.id, count),
    onSuccess: (s) => {
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["headless-clients", server.id] });
      // Report what will actually run, which a staff comp can keep above the
      // count the customer just chose.
      const running = Math.max(s.count, s.compedCount);
      toast.success(
        running > 0
          ? `${running} headless client${running === 1 ? "" : "s"} — applies on next restart`
          : "Headless clients disabled — applies on next restart",
      );
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Failed to update headless clients",
      ),
  });

  // Staff can comp clients on a server whose add-on isn't publicly offered —
  // the customer still needs to see what they've been given.
  if (!status || (!status.enabled && status.compedCount === 0)) return null;
  const count = draft ?? status.count;
  const dirty = draft !== null && draft !== status.count;
  const comped = status.compedCount;
  const applied = Math.max(count, comped);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="size-5" /> Headless clients
        </CardTitle>
        <CardDescription>
          Offload AI to dedicated helper processes for HC-aware missions
          (Antistasi, Liberation). They run inside your server&apos;s resources
          with your mods and connect over localhost — no extra setup. Each
          client loads your full mod set, so it costs roughly another game
          instance of RAM: with a heavy mod list, 2–3 clients usually need a
          larger plan, and running out shows as the server being killed
          (&quot;OUT OF MEMORY&quot; in the console).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              {formatMoney(status.monthlyMinor, status.currency)}/mo per client
            </p>
            <p className="text-xs text-muted-foreground">
              {status.unbilled
                ? "This server has no subscription — changes apply without billing."
                : "Billed from your next renewal invoice. Applies on the next restart."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={count <= 0 || save.isPending || !status.enabled}
              onClick={() => setDraft(Math.max(0, count - 1))}
              aria-label="Fewer headless clients"
            >
              <Minus />
            </Button>
            <span className="w-8 text-center font-semibold">{count}</span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={count >= status.max || save.isPending || !status.enabled}
              onClick={() => setDraft(Math.min(status.max, count + 1))}
              aria-label="More headless clients"
            >
              <Plus />
            </Button>
            <Button
              size="sm"
              className="ml-2"
              loading={save.isPending}
              disabled={!dirty || !status.enabled}
              onClick={() => save.mutate(count)}
            >
              Save
            </Button>
          </div>
        </div>
        {comped > 0 && (
          <p className="rounded-lg border border-success/30 bg-success/5 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {comped} client{comped === 1 ? "" : "s"} comped by staff — free.
            </span>{" "}
            {count > comped
              ? `You pay for ${count}, so ${applied} run in total.`
              : `${applied} run in total and you're billed for ${count}. Buying up to ${comped} adds no extra clients — the comp already covers them.`}
          </p>
        )}
        {count > 0 && !status.unbilled && (
          <p className="text-xs text-muted-foreground">
            Total: {formatMoney(status.monthlyMinor * count, status.currency)}/mo
            for {count} paid client{count === 1 ? "" : "s"}. The mission must
            support headless clients.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
