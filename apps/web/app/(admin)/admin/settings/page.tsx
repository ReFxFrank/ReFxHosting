"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Send, Boxes } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, ListSkeleton } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Platform-wide configuration for the panel."
      />
      <EmailSettingsCard />
      <SteamSettingsCard />
    </div>
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

  const usernameV = username ?? cfg?.username ?? "";

  const save = useMutation({
    mutationFn: () => {
      const input: Record<string, unknown> = { username: usernameV };
      if (password) input.password = password;
      if (apiKey) input.apiKey = apiKey;
      return api.admin.setSteamConfig(input);
    },
    onSuccess: () => {
      toast.success("Steam settings saved");
      setPassword("");
      setApiKey("");
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
            <p className="text-xs text-muted-foreground">
              Note: the account must <strong>own the game</strong> to download most of its
              paid/Workshop content, and accounts with Steam Guard may need an exemption or
              an app password for unattended steamcmd use.
            </p>
            <div className="flex justify-end">
              <Button loading={save.isPending} onClick={() => save.mutate()}>
                Save Steam settings
              </Button>
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
  const [testTo, setTestTo] = useState("");

  const hostV = host ?? cfg?.host ?? "";
  const portV = port ?? String(cfg?.port ?? 587);
  const userV = user ?? cfg?.user ?? "";
  const fromV = from ?? cfg?.from ?? "";
  const secureV = secure ?? cfg?.secure ?? false;

  const save = useMutation({
    mutationFn: () => {
      const input: Record<string, unknown> = {
        host: hostV,
        port: Number(portV) || 587,
        user: userV,
        from: fromV,
        secure: secureV,
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
