"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Send, Boxes, ShieldCheck, Globe } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, ListSkeleton } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Platform-wide configuration for the panel."
      />
      <EmailSettingsCard />
      <SteamSettingsCard />
      <VanitySettingsCard />
      <BackupStorageSettingsCard />
      <ExpressBackupsSettingsCard />
    </div>
  );
}

/** Centrally-managed S3/R2 storage, saved once and pushed to every node. */
function BackupStorageSettingsCard() {
  const queryClient = useQueryClient();
  const { data: cfg, isLoading } = useQuery({
    queryKey: ["admin", "backup-storage-config"],
    queryFn: () => api.admin.backupStorageConfig(),
  });

  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [bucket, setBucket] = useState<string | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [pathStyle, setPathStyle] = useState<boolean | null>(null);
  const [pushResults, setPushResults] = useState<
    { nodeId: string; name: string; ok: boolean; error?: string }[] | null
  >(null);

  const endpointV = endpoint ?? cfg?.endpoint ?? "";
  const regionV = region ?? cfg?.region ?? "auto";
  const bucketV = bucket ?? cfg?.bucket ?? "";
  const pathStyleV = pathStyle ?? cfg?.usePathStyle ?? false;

  const save = useMutation({
    mutationFn: () =>
      api.admin.setBackupStorageConfig({
        endpoint: endpointV.trim(),
        region: regionV.trim() || "auto",
        bucket: bucketV.trim(),
        // Write-only: empty means "keep the stored key".
        accessKey: accessKey.trim() || undefined,
        secretKey: secretKey.trim() || undefined,
        usePathStyle: pathStyleV,
      }),
    onSuccess: (res) => {
      const ok = res.push.filter((r) => r.ok).length;
      toast.success(
        `Storage saved — pushed to ${ok}/${res.push.length} node(s)`,
      );
      setPushResults(res.push);
      setAccessKey("");
      setSecretKey("");
      queryClient.invalidateQueries({
        queryKey: ["admin", "backup-storage-config"],
      });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save"),
  });

  const repush = useMutation({
    mutationFn: () => api.admin.pushBackupStorage(),
    onSuccess: (res) => {
      const ok = res.push.filter((r) => r.ok).length;
      toast.success(`Pushed to ${ok}/${res.push.length} node(s)`);
      setPushResults(res.push);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Push failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Boxes className="size-4 text-primary" /> Backup storage (S3 / R2)
        </CardTitle>
        <CardDescription>
          Enter your object-storage credentials ONCE — the panel pushes them to
          every node over the signed agent channel (and to new nodes
          automatically at registration). No node config edits, no restarts.
          Powers the Express backups add-on. Clearing the bucket disables
          offsite storage everywhere.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !cfg ? (
          <ListSkeleton rows={3} />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bs-endpoint">Endpoint</Label>
                <Input
                  id="bs-endpoint"
                  placeholder="https://<accountid>.r2.cloudflarestorage.com"
                  value={endpointV}
                  onChange={(e) => setEndpoint(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  R2/B2/MinIO endpoint; leave empty for AWS S3.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bs-region">Region</Label>
                <Input
                  id="bs-region"
                  placeholder="auto"
                  value={regionV}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bs-bucket">Bucket</Label>
                <Input
                  id="bs-bucket"
                  placeholder="refx-backups"
                  value={bucketV}
                  onChange={(e) => setBucket(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.08] p-3">
                <div>
                  <Label>Path-style addressing</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Enable for MinIO (and some R2 setups).
                  </p>
                </div>
                <Switch checked={pathStyleV} onCheckedChange={setPathStyle} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bs-access">
                  Access key{cfg.accessKeySet ? " (set)" : ""}
                </Label>
                <Input
                  id="bs-access"
                  type="password"
                  placeholder={cfg.accessKeySet ? "•••••• (keep current)" : ""}
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bs-secret">
                  Secret key{cfg.secretKeySet ? " (set)" : ""}
                </Label>
                <Input
                  id="bs-secret"
                  type="password"
                  placeholder={cfg.secretKeySet ? "•••••• (keep current)" : ""}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                loading={save.isPending}
                disabled={
                  !bucketV.trim() &&
                  !cfg.configured /* allow clearing when configured */
                }
                onClick={() => save.mutate()}
              >
                Save & push to all nodes
              </Button>
              {cfg.configured && (
                <Button
                  variant="outline"
                  loading={repush.isPending}
                  onClick={() => repush.mutate()}
                >
                  Re-push to nodes
                </Button>
              )}
            </div>
            {pushResults && (
              <div className="space-y-1 rounded-lg border border-white/[0.08] p-3 text-sm">
                {pushResults.map((r) => (
                  <div key={r.nodeId} className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs">{r.name}</span>
                    {r.ok ? (
                      <Badge variant="success" className="text-[10px]">
                        Applied
                      </Badge>
                    ) : (
                      <span
                        className="max-w-[60%] truncate text-xs text-destructive"
                        title={r.error}
                      >
                        {r.error ?? "failed"} — applies at next agent boot
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Express backups add-on: enable/disable + monthly fee. */
function ExpressBackupsSettingsCard() {
  const queryClient = useQueryClient();
  const { data: cfg, isLoading } = useQuery({
    queryKey: ["admin", "express-backups-config"],
    queryFn: () => api.admin.expressBackupsConfig(),
  });

  const [feeStr, setFeeStr] = useState<string | null>(null);
  const feeV = feeStr ?? (cfg ? String(cfg.monthlyMinor) : "");
  const feeNum = Number(feeV);
  const feeValid = Number.isInteger(feeNum) && feeNum >= 0 && feeNum <= 100000;

  const save = useMutation({
    mutationFn: (input: { enabled?: boolean; monthlyMinor?: number }) =>
      api.admin.setExpressBackupsConfig(input),
    onSuccess: () => {
      toast.success("Express-backups settings saved");
      queryClient.invalidateQueries({
        queryKey: ["admin", "express-backups-config"],
      });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Boxes className="size-4 text-primary" /> Express backups
        </CardTitle>
        <CardDescription>
          Paid add-on at checkout: backups go to offsite object storage
          (S3/R2) with resumable high-speed direct downloads, billed monthly
          on top of the plan. Nodes need S3 credentials in their agent config
          (<span className="font-mono">backup.s3</span>) — servers without the
          add-on keep using the node&apos;s local disk.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !cfg ? (
          <ListSkeleton rows={2} />
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-white/[0.08] p-3">
              <div>
                <Label>Offer at checkout</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Show the add-on on the order page.
                </p>
              </div>
              <Switch
                checked={cfg.enabled}
                onCheckedChange={(v) => save.mutate({ enabled: v })}
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="express-fee">Monthly fee (minor units)</Label>
                <Input
                  id="express-fee"
                  className="w-40"
                  value={feeV}
                  onChange={(e) => setFeeStr(e.target.value)}
                  placeholder="200"
                />
                <p className="text-xs text-muted-foreground">
                  e.g. 200 = $2.00/mo, scaled to the plan&apos;s billing cycle.
                </p>
              </div>
              <Button
                variant="outline"
                loading={save.isPending}
                disabled={!feeValid || feeV === String(cfg.monthlyMinor)}
                onClick={() => save.mutate({ monthlyMinor: feeNum })}
              >
                Save fee
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Custom server addresses: enable/disable, one-time fee, extra reserved words. */
function VanitySettingsCard() {
  const queryClient = useQueryClient();
  const { data: cfg, isLoading } = useQuery({
    queryKey: ["admin", "vanity-config"],
    queryFn: () => api.admin.vanityConfig(),
  });

  const [feeStr, setFeeStr] = useState<string | null>(null);
  const [words, setWords] = useState<string | null>(null);

  const feeV = feeStr ?? (cfg ? String(cfg.feeMinor) : "");
  const wordsV = words ?? (cfg ? cfg.reservedWords.join("\n") : "");
  const feeNum = Number(feeV);
  const feeValid = Number.isInteger(feeNum) && feeNum >= 0 && feeNum <= 100000;

  const save = useMutation({
    mutationFn: (input: {
      enabled?: boolean;
      feeMinor?: number;
      reservedWords?: string[];
    }) => api.admin.setVanityConfig(input),
    onSuccess: () => {
      toast.success("Custom-address settings saved");
      queryClient.invalidateQueries({ queryKey: ["admin", "vanity-config"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="size-4 text-primary" /> Custom server addresses
        </CardTitle>
        <CardDescription>
          Let customers buy a custom name for their server&apos;s branded
          address (e.g.{" "}
          <span className="font-mono">whatever.virginia.rfx.refx.gg</span>).
          Requires a game domain + wildcard DNS on the node.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !cfg ? (
          <ListSkeleton rows={2} />
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Enable purchases</p>
                <p className="text-xs text-muted-foreground">
                  Turn off to hide the card from customers (existing names keep
                  working).
                </p>
              </div>
              <Switch
                checked={cfg.enabled}
                onCheckedChange={(v) => save.mutate({ enabled: v })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="vanity-fee">One-time fee (cents)</Label>
                <Input
                  id="vanity-fee"
                  inputMode="numeric"
                  value={feeV}
                  onChange={(e) => setFeeStr(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {feeValid
                    ? feeNum === 0
                      ? "Free — applied instantly with no invoice."
                      : `Customers pay ${(feeNum / 100).toFixed(2)} (their plan currency) per name.`
                    : "Enter a whole number of cents (0-100000)."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vanity-words">Extra reserved words</Label>
                <Textarea
                  id="vanity-words"
                  rows={4}
                  placeholder="one per line"
                  value={wordsV}
                  onChange={(e) => setWords(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Merged with the built-in infrastructure/brand list.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                loading={save.isPending}
                disabled={!feeValid}
                onClick={() =>
                  save.mutate({
                    feeMinor: feeNum,
                    reservedWords: wordsV
                      .split(/\n/)
                      .map((w) => w.trim())
                      .filter(Boolean),
                  })
                }
              >
                Save
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SteamSettingsCard() {
  const queryClient = useQueryClient();
  const { data: cfg, isLoading } = useQuery({
    queryKey: ["admin", "steam-config"],
    queryFn: () => api.admin.steamConfig(),
  });

  const [username, setUsername] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [guardCode, setGuardCode] = useState("");
  const [verifyNode, setVerifyNode] = useState("");
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; output: string } | null>(null);
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  const usernameV = username ?? cfg?.username ?? "";

  const { data: nodes } = useQuery({
    queryKey: ["admin", "nodes"],
    queryFn: () => api.admin.nodes(),
  });

  const verify = useMutation({
    mutationFn: () =>
      api.admin.verifySteamLogin(verifyNode, guardCode.trim() || undefined),
    onSuccess: (res) => {
      setVerifyResult(res);
      if (res.ok) {
        toast.success("Steam login verified + cached on the node");
        setGuardCode("");
      } else {
        toast.error("Steam login failed — see details below");
      }
      queryClient.invalidateQueries({ queryKey: ["admin", "steam-config"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Verify failed"),
  });

  // "Send fresh code": attempt a login with NO Guard code, which makes Steam
  // EMAIL a fresh code to the account (you can't generate an email code yourself —
  // Steam sends one on a login attempt). If the node is already cached it just
  // succeeds. Reuses the same verify endpoint.
  const sendCode = useMutation({
    mutationFn: () => api.admin.verifySteamLogin(verifyNode),
    onSuccess: (res) => {
      const out = (res.output || "").toLowerCase();
      if (res.ok) {
        setVerifyResult(res);
        setSentMsg(null);
        toast.success("Already logged in — this node is cached, no code needed.");
      } else if (out.includes("invalid password") || out.includes("logon denied")) {
        setVerifyResult(res);
        setSentMsg(null);
        toast.error("Steam rejected the username/password — fix + save those first.");
      } else {
        setSentMsg(
          "Steam just emailed a fresh Guard code to the account. Check the inbox, enter it above, then click Verify & cache.",
        );
        toast.success("Triggered a fresh Steam Guard email");
      }
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn't trigger a code"),
  });

  const save = useMutation({
    mutationFn: () => {
      const input: Record<string, unknown> = { username: usernameV };
      if (password) input.password = password;
      if (apiKey) input.apiKey = apiKey;
      if (guardCode.trim()) input.guardCode = guardCode.trim();
      return api.admin.setSteamConfig(input);
    },
    onSuccess: () => {
      toast.success("Steam settings saved");
      setPassword("");
      setApiKey("");
      setGuardCode("");
      queryClient.invalidateQueries({ queryKey: ["admin", "steam-config"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to save"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Boxes className="size-4" /> Steam — game downloads
        </CardTitle>
        <CardDescription>
          The host account used to download <strong>game server files</strong> for games
          that aren&apos;t anonymous (e.g. Arma 3, DayZ). This account should <strong>own
          those games</strong>. It is <strong>not</strong> used for Workshop mods —
          customers connect their own account on each server&apos;s Workshop tab for that.
          Secrets are encrypted at rest and never returned.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <ListSkeleton rows={3} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={cfg?.loginConfigured ? "success" : "secondary"}>
                {cfg?.loginConfigured ? "Game account configured" : "No game account (anonymous)"}
              </Badge>
              <Badge variant={cfg?.apiKeySet ? "success" : "secondary"}>
                {cfg?.apiKeySet ? "API key set" : "No API key"}
              </Badge>
              {cfg?.guardCodePending && (
                <Badge variant="warning">Steam Guard code staged</Badge>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Steam username</Label>
                <Input
                  autoComplete="off"
                  value={usernameV}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="steam-account"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Steam password {cfg?.passwordSet && <span className="text-xs text-muted-foreground">(set — leave blank to keep)</span>}</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Steam Web API key {cfg?.apiKeySet && <span className="text-xs text-muted-foreground">(set — leave blank to keep)</span>}</Label>
              <Input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="optional — improves Workshop name/collection lookups"
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Steam Guard code{" "}
                <span className="text-xs text-muted-foreground">
                  (one-time — only needed the first time this account logs in on a node)
                </span>
              </Label>
              <Input
                autoComplete="off"
                value={guardCode}
                onChange={(e) => setGuardCode(e.target.value)}
                placeholder="e.g. K4F9Q"
              />
              <p className="text-xs text-muted-foreground">
                If the game-download account has Steam Guard enabled, steamcmd needs a
                code the first time it logs in on each node. Enter your current code
                here, save, then reinstall the server — it&apos;s passed to Steam for
                that download and consumed immediately (it won&apos;t be reused).{" "}
                <strong>Email</strong> codes work best; mobile-authenticator codes can
                expire before the install runs. After the first successful login the node
                is remembered, so you usually won&apos;t need this again.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Note: the account must <strong>own the game</strong> to download most of its
              paid/Workshop content. With Steam Guard on, use the code field above for the
              first unattended steamcmd login on a node.
            </p>
            <div className="flex justify-end">
              <Button loading={save.isPending} onClick={() => save.mutate()}>
                Save Steam settings
              </Button>
            </div>

            <div className="space-y-2 border-t border-white/[0.06] pt-4">
              <Label className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" /> Verify &amp; cache login
                on a node
              </Label>
              <p className="text-xs text-muted-foreground">
                Logs in to Steam on a node <strong>right now</strong> (pre-warming
                steamcmd so the code stays valid) and caches the machine-auth there —
                after it succeeds, owned-game installs (Arma&nbsp;3, DayZ, …) on that
                node need no code. <strong>Email-code accounts:</strong> pick a node →
                <strong> Send fresh email code</strong> → Steam emails one → enter it in
                the Guard field above → <strong>Verify &amp; cache</strong>.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={verifyNode} onValueChange={setVerifyNode}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Pick a node…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(nodes ?? []).map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  loading={sendCode.isPending}
                  disabled={!verifyNode}
                  onClick={() => sendCode.mutate()}
                  title="Make Steam email a fresh Guard code to the account"
                >
                  <Mail className="size-4" /> Send fresh email code
                </Button>
                <Button
                  variant="outline"
                  loading={verify.isPending}
                  disabled={!verifyNode}
                  onClick={() => verify.mutate()}
                >
                  <ShieldCheck className="size-4" /> Verify &amp; cache
                </Button>
              </div>
              {sentMsg && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                  <Mail className="mr-1 inline size-3 text-primary" /> {sentMsg}
                </div>
              )}
              {verifyResult && (
                <div
                  className={cn(
                    "rounded-md border p-2 text-xs",
                    verifyResult.ok
                      ? "border-success/30 bg-success/5"
                      : "border-destructive/30 bg-destructive/5",
                  )}
                >
                  <p className="font-medium">
                    {verifyResult.ok
                      ? "✓ Login succeeded — this node is cached. No more codes needed here."
                      : "✗ Login failed — check the credentials/code and the log below."}
                  </p>
                  {verifyResult.output && (
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-muted-foreground">
                      {verifyResult.output}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EmailSettingsCard() {
  const queryClient = useQueryClient();
  const { data: cfg, isLoading } = useQuery({
    queryKey: ["admin", "email-config"],
    queryFn: () => api.admin.emailConfig(),
  });

  // Non-secret fields prefill; the password is write-only (blank = unchanged).
  const [host, setHost] = useState<string | null>(null);
  const [port, setPort] = useState<string | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [secure, setSecure] = useState<boolean | null>(null);
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  const [testTo, setTestTo] = useState("");

  const hostV = host ?? cfg?.host ?? "";
  const portV = port ?? String(cfg?.port ?? 587);
  const userV = user ?? cfg?.user ?? "";
  const fromV = from ?? cfg?.from ?? "";
  const secureV = secure ?? cfg?.secure ?? false;
  const themeV = theme ?? cfg?.theme ?? "dark";

  const save = useMutation({
    mutationFn: () => {
      const input: Record<string, unknown> = {
        host: hostV,
        port: Number(portV) || 587,
        user: userV,
        from: fromV,
        secure: secureV,
        theme: themeV,
      };
      if (password) input.password = password;
      return api.admin.setEmailConfig(input);
    },
    onSuccess: () => {
      toast.success("Email settings saved");
      setPassword("");
      queryClient.invalidateQueries({ queryKey: ["admin", "email-config"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to save"),
  });

  const test = useMutation({
    mutationFn: () => api.admin.sendTestEmail(testTo),
    onSuccess: (res) =>
      toast.success(
        res.delivered
          ? `Test email sent to ${testTo}`
          : "SMTP not configured — email was logged, not delivered.",
      ),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to send test"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="size-4" /> Email (SMTP){" "}
          <Badge variant={cfg?.configured ? "success" : "muted"}>
            {cfg?.configured ? "Configured" : "Not configured"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Used for verification, password reset, welcome and payment emails. Leave
          the host blank to disable real delivery (emails are logged instead).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-host">SMTP host</Label>
                <Input
                  id="smtp-host"
                  placeholder="smtp.example.com"
                  value={hostV}
                  onChange={(e) => setHost(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-port">Port</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  placeholder="587"
                  value={portV}
                  onChange={(e) => setPort(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-user">Username</Label>
                <Input
                  id="smtp-user"
                  value={userV}
                  onChange={(e) => setUser(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-pass">Password</Label>
                <Input
                  id="smtp-pass"
                  type="password"
                  placeholder={cfg?.passwordSet ? "•••• set" : ""}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="smtp-from">From address</Label>
                <Input
                  id="smtp-from"
                  placeholder="ReFx Hosting <no-reply@refx.gg>"
                  value={fromV}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">TLS on connect (SSL)</p>
                <p className="text-xs text-muted-foreground">
                  Enable for port 465. Leave off for 587/STARTTLS.
                </p>
              </div>
              <Switch checked={secureV} onCheckedChange={(v: boolean) => setSecure(v)} />
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">Email theme</p>
              <p className="text-xs text-muted-foreground">
                Style for all transactional emails. <strong>Dark</strong> matches the
                site; <strong>Light</strong> renders consistently everywhere (some
                clients, e.g. Gmail, override dark emails).
              </p>
              <div className="flex gap-2 pt-1">
                {(["dark", "light"] as const).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={themeV === t ? "default" : "outline"}
                    onClick={() => setTheme(t)}
                  >
                    {t === "dark" ? "Dark" : "Light"}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button loading={save.isPending} onClick={() => save.mutate()}>
                Save email settings
              </Button>
            </div>

            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="smtp-test">Send a test email</Label>
              <div className="flex gap-2">
                <Input
                  id="smtp-test"
                  type="email"
                  placeholder="you@example.com"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                />
                <Button
                  variant="outline"
                  loading={test.isPending}
                  disabled={!testTo.trim()}
                  onClick={() => test.mutate()}
                >
                  <Send className="size-4" /> Send test
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Save your settings first — the test uses the saved configuration.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
