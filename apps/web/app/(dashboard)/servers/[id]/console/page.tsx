"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Square, RotateCw, Zap, Cpu, MemoryStick, HardDrive, Send, Users, Globe, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { type ConsoleEvent, type ConsoleStats } from "@/lib/ws";
import { getConsole, type ConsoleHandle } from "@/lib/console-hub";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { ResourceGauge, type GaugePoint } from "@/components/server/resource-gauge";
import { formatMb, pct, copyToClipboard } from "@/lib/utils";
import type { ServerState } from "@/lib/types";

const MAX_POINTS = 30;

export default function ConsolePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const termRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<ConsoleHandle | null>(null);
  // xterm instances are loaded dynamically (browser-only).
  const xtermRef = useRef<{ term: import("xterm").Terminal; fit: () => void } | null>(null);

  const [connected, setConnected] = useState(false);
  const [liveState, setLiveState] = useState<ServerState | null>(null);
  const [stats, setStats] = useState<ConsoleStats | null>(null);
  const [cpuHist, setCpuHist] = useState<GaugePoint[]>([]);
  const [memHist, setMemHist] = useState<GaugePoint[]>([]);
  const [diskHist, setDiskHist] = useState<GaugePoint[]>([]);
  const [command, setCommand] = useState("");
  const cmdHistory = useRef<string[]>([]);
  const cmdIndex = useRef(-1);

  const { data: server } = useQuery({
    queryKey: ["server", id],
    queryFn: () => api.servers.get(id),
  });

  const state = liveState ?? server?.state ?? "OFFLINE";

  const writeLine = useCallback((line: string) => {
    xtermRef.current?.term.writeln(line.replace(/\n$/, ""));
  }, []);

  const onEvent = useCallback(
    (ev: ConsoleEvent) => {
      switch (ev.type) {
        case "open":
          setConnected(true);
          writeLine("\x1b[32m[refx] console connected\x1b[0m");
          break;
        case "close":
          setConnected(false);
          break;
        case "line":
          writeLine(ev.line);
          break;
        case "status":
          setLiveState(ev.state);
          queryClient.invalidateQueries({ queryKey: ["server", id] });
          break;
        case "stats": {
          const s = ev.stats;
          setStats(s);
          const now = Date.now();
          // s.cpuPct is % of ONE core (Docker convention); store cores-used so the
          // sparkline and gauge read as a fraction of the server's vCPU allotment.
          setCpuHist((p) => [...p, { t: now, value: Math.round(s.cpuPct) / 100 }].slice(-MAX_POINTS));
          setMemHist((p) => [...p, { t: now, value: s.memUsedMb }].slice(-MAX_POINTS));
          setDiskHist((p) => [...p, { t: now, value: s.diskUsedMb }].slice(-MAX_POINTS));
          break;
        }
        case "error":
          writeLine(`\x1b[31m[refx] ${ev.message}\x1b[0m`);
          break;
      }
    },
    [writeLine, queryClient, id],
  );

  // Initialise xterm + socket on mount (client-only dynamic import).
  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("xterm"),
        import("xterm-addon-fit"),
      ]);
      if (disposed || !termRef.current) return;

      const term = new Terminal({
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        fontSize: 13,
        cursorBlink: true,
        convertEol: true,
        theme: {
          background: "#0a0a0c",
          foreground: "#e4e4e7",
          cursor: "#7c5cff",
          selectionBackground: "#3f3f46",
        },
        scrollback: 5000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(termRef.current);
      fit.fit();
      term.writeln("\x1b[90mReFx Hosting console — connecting…\x1b[0m");
      xtermRef.current = { term, fit: () => fit.fit() };

      // Ctrl/Cmd+C copies the current selection (like a desktop terminal). With
      // no selection it falls through so the keystroke still reaches the server.
      term.attachCustomKeyEventHandler((e) => {
        if (
          e.type === "keydown" &&
          (e.ctrlKey || e.metaKey) &&
          !e.altKey &&
          e.key.toLowerCase() === "c"
        ) {
          const sel = term.getSelection();
          if (sel) {
            void copyToClipboard(sel);
            return false;
          }
        }
        return true;
      });

      resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          /* terminal not ready */
        }
      });
      resizeObserver.observe(termRef.current);

      // Attach to the shared, persistent console for this server: replay the
      // buffered history, sync current state, then subscribe to new events. The
      // socket lives in the hub and survives tab switches.
      const con = getConsole(id);
      consoleRef.current = con;
      for (const line of con.lines) writeLine(line);
      setConnected(con.connected);
      if (con.state) setLiveState(con.state);
      if (con.stats) setStats(con.stats);
      unsubscribe = con.subscribe(onEvent);
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      unsubscribe?.();
      consoleRef.current = null;
      xtermRef.current?.term.dispose();
      xtermRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function power(signal: "start" | "stop" | "restart" | "kill") {
    // Power actions go over REST (the console gateway only handles console I/O).
    try {
      await api.servers.power(id, signal);
    } catch {
      toast.error("Power action failed");
      return;
    }
    toast.success(`Sent ${signal} signal`);
  }

  function sendCommand() {
    const cmd = command.trim();
    if (!cmd) return;
    const echo = `\x1b[36m> ${cmd}\x1b[0m`;
    if (consoleRef.current && connected) {
      consoleRef.current.sendCommand(cmd);
      consoleRef.current.echo(echo); // persist the echo in the shared buffer
      writeLine(echo);
    } else {
      api.servers.command(id, cmd).catch(() => toast.error("Failed to send command"));
    }
    cmdHistory.current.unshift(cmd);
    cmdIndex.current = -1;
    setCommand("");
  }

  function onCommandKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      sendCommand();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(cmdIndex.current + 1, cmdHistory.current.length - 1);
      cmdIndex.current = next;
      setCommand(cmdHistory.current[next] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(cmdIndex.current - 1, -1);
      cmdIndex.current = next;
      setCommand(next === -1 ? "" : cmdHistory.current[next] ?? "");
    }
  }

  const address = server?.primaryAllocation
    ? `${server.primaryAllocation.alias || server.primaryAllocation.ip}:${server.primaryAllocation.port}`
    : null;

  async function copyAddress() {
    if (!address) return;
    try {
      if (!(await copyToClipboard(address))) throw new Error("copy failed");
      toast.success("Address copied");
    } catch {
      toast.error("Couldn't copy address");
    }
  }

  const running = state === "RUNNING" || state === "STARTING";
  // Use `||` so a 0/absent agent-reported limit falls back to the plan limit
  // (nullish `??` would keep a 0 and show "/0B" + 0%).
  const memLimit = stats?.memLimitMb || server?.memoryMb || 0;
  const diskLimit = stats?.diskLimitMb || server?.diskMb || 0;
  // CPU: the agent reports % of a single core, so divide by the server's vCPU
  // allotment to show utilisation of the plan (100% = using every allotted core),
  // instead of a "% of one core" number that misleads on multi-core tiers.
  const cpuLimit = server?.cpuCores || 0;
  const cpuCoresUsed = (stats?.cpuPct ?? 0) / 100;
  const cpuPctOfPlan =
    cpuLimit > 0 ? Math.round((cpuCoresUsed / cpuLimit) * 100) : Math.round(stats?.cpuPct ?? 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      {/* Console + controls */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="success" onClick={() => power("start")} disabled={running}>
            <Play className="size-4" /> Start
          </Button>
          <Button size="sm" variant="outline" onClick={() => power("restart")}>
            <RotateCw className="size-4" /> Restart
          </Button>
          <Button size="sm" variant="outline" onClick={() => power("stop")} disabled={state === "OFFLINE"}>
            <Square className="size-4" /> Stop
          </Button>
          <Button size="sm" variant="destructive" onClick={() => power("kill")} disabled={state === "OFFLINE"}>
            <Zap className="size-4" /> Kill
          </Button>
          <div className="ml-auto">
            <Badge variant={connected ? "success" : "muted"}>
              <span className={`size-1.5 rounded-full bg-current ${connected ? "animate-pulse" : ""}`} />
              {connected ? "Live" : "Disconnected"}
            </Badge>
          </div>
        </div>

        <Card className="overflow-hidden border bg-[#0a0a0c]">
          <div ref={termRef} className="h-[480px] w-full" />
        </Card>

        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">$</span>
          <Input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={onCommandKey}
            placeholder="Type a command and press Enter…"
            className="font-mono"
            disabled={!running && state !== "OFFLINE"}
          />
          <Button size="icon" onClick={sendCommand} aria-label="Send command">
            <Send className="size-4" />
          </Button>
        </div>
      </div>

      {/* Live gauges */}
      <div className="space-y-3">
        {/* Connection address — what players put in their game client. */}
        <Card className="space-y-2 p-4">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="size-4" /> Server Address
          </span>
          {address ? (
            <div className="flex items-center justify-between gap-2">
              <code className="truncate font-mono text-sm font-semibold tabular-nums">
                {address}
              </code>
              <Button
                size="icon"
                variant="outline"
                onClick={copyAddress}
                aria-label="Copy server address"
              >
                <Copy className="size-4" />
              </Button>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              No address allocated yet
            </span>
          )}
        </Card>

        <ResourceGauge
          label="CPU"
          icon={Cpu}
          current={cpuLimit > 0 ? cpuCoresUsed.toFixed(1) : `${Math.round(stats?.cpuPct ?? 0)}`}
          unit={cpuLimit > 0 ? `/ ${cpuLimit} vCPU` : "%"}
          pctValue={cpuPctOfPlan}
          history={cpuHist}
        />
        <ResourceGauge
          label="Memory"
          icon={MemoryStick}
          current={formatMb(stats?.memUsedMb ?? 0)}
          unit={`/ ${formatMb(memLimit)}`}
          pctValue={pct(stats?.memUsedMb ?? 0, memLimit)}
          history={memHist}
        />
        <ResourceGauge
          label="Disk"
          icon={HardDrive}
          current={formatMb(stats?.diskUsedMb ?? 0)}
          unit={`/ ${formatMb(diskLimit)}`}
          pctValue={pct(stats?.diskUsedMb ?? 0, diskLimit)}
          history={diskHist}
        />
        {stats?.players !== undefined && (
          <Card className="flex items-center justify-between p-4">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" /> Players
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {stats.players}
              {server?.slots ? ` / ${server.slots}` : ""}
            </span>
          </Card>
        )}
      </div>
    </div>
  );
}
