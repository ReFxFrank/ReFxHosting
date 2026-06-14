"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  User as UserIcon,
  ShieldCheck,
  KeyRound,
  Fingerprint,
  Smartphone,
  Monitor,
  Copy,
  Check,
  Plus,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { cn, formatRelative, formatDate, initials } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import type { ApiKey } from "@/lib/types";

const SCOPES: ApiKey["scopes"] = ["READ", "WRITE", "ADMIN"];

export default function AccountPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Account"
        description="Manage your profile, security and access."
      />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">
            <UserIcon /> Profile
          </TabsTrigger>
          <TabsTrigger value="security">
            <ShieldCheck /> Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

const profileSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().optional(),
  locale: z.string().min(1, "Required"),
  timezone: z.string().min(1, "Required"),
});
type ProfileValues = z.infer<typeof profileSchema>;

function ProfileTab() {
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      locale: user?.locale ?? "",
      timezone: user?.timezone ?? "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: ProfileValues) =>
      api.account.update({
        firstName: values.firstName,
        lastName: values.lastName,
        locale: values.locale,
        timezone: values.timezone,
      }),
    onSuccess: async () => {
      await refreshUser();
      toast.success("Profile updated");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to update profile"),
  });

  if (!user) return <ListSkeletonCard />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your personal details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-16 text-base">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={fullName} />}
            <AvatarFallback>{initials(fullName, user.email)}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">{fullName || user.email}</p>
              {user.emailVerifiedAt ? (
                <Badge variant="success">Verified</Badge>
              ) : (
                <Badge variant="warning">Unverified</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit((v) => updateMutation.mutate(v))}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" {...register("firstName")} />
              {errors.firstName && (
                <p className="text-xs text-destructive">{errors.firstName.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" {...register("lastName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user.email} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="locale">Locale</Label>
              <Input id="locale" placeholder="en-US" {...register("locale")} />
              {errors.locale && (
                <p className="text-xs text-destructive">{errors.locale.message}</p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" placeholder="UTC" {...register("timezone")} />
              {errors.timezone && (
                <p className="text-xs text-destructive">{errors.timezone.message}</p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              loading={updateMutation.isPending}
              disabled={!isDirty}
            >
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

function SecurityTab() {
  return (
    <div className="space-y-6">
      <PasswordCard />
      <TotpCard />
      <PasskeysCard />
      <ApiKeysCard />
      <SessionsCard />
    </div>
  );
}

// --- Password --------------------------------------------------------------

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z.string().min(10, "Use at least 10 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });
type PasswordValues = z.infer<typeof passwordSchema>;

function PasswordCard() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  const mutation = useMutation({
    mutationFn: (values: PasswordValues) =>
      api.account.changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => {
      toast.success("Password changed");
      reset();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to change password"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> Password
        </CardTitle>
        <CardDescription>Choose a strong, unique password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4 max-w-md"
        >
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...register("currentPassword")}
            />
            {errors.currentPassword && (
              <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...register("newPassword")}
            />
            {errors.newPassword && (
              <p className="text-xs text-destructive">{errors.newPassword.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              {...register("confirm")}
            />
            {errors.confirm && (
              <p className="text-xs text-destructive">{errors.confirm.message}</p>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={mutation.isPending}>
              Update password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// --- TOTP ------------------------------------------------------------------

function TotpCard() {
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  const enabled = !!user?.totpEnabledAt;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="size-4" /> Two-factor (TOTP)
        </CardTitle>
        <CardDescription>
          Require a one-time code from an authenticator app when signing in.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {enabled ? (
            <>
              <Badge variant="success">Enabled</Badge>
              <span className="text-sm text-muted-foreground">
                Active since {formatDate(user!.totpEnabledAt!)}
              </span>
            </>
          ) : (
            <Badge variant="muted">Disabled</Badge>
          )}
        </div>
        {enabled ? (
          <Button variant="outline" onClick={() => setDisableOpen(true)}>
            Disable
          </Button>
        ) : (
          <Button onClick={() => setSetupOpen(true)}>Enable</Button>
        )}
      </CardContent>

      <TotpSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        onEnabled={refreshUser}
      />
      <TotpDisableDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        onDisabled={refreshUser}
      />
    </Card>
  );
}

function TotpSetupDialog({
  open,
  onOpenChange,
  onEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnabled: () => Promise<void> | void;
}) {
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const setupQuery = useQuery({
    queryKey: ["account", "totp", "setup"],
    queryFn: () => api.account.totpSetup(),
    enabled: open && !recoveryCodes,
    staleTime: 0,
    gcTime: 0,
  });

  const enableMutation = useMutation({
    mutationFn: () => api.account.totpEnable(code.trim()),
    onSuccess: async (res) => {
      setRecoveryCodes(res.recoveryCodes);
      await onEnabled();
      toast.success("Two-factor authentication enabled");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Invalid code"),
  });

  function close(o: boolean) {
    if (!o) {
      setCode("");
      setRecoveryCodes(null);
    }
    onOpenChange(o);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        {recoveryCodes ? (
          <>
            <DialogHeader>
              <DialogTitle>Save your recovery codes</DialogTitle>
              <DialogDescription>
                Store these somewhere safe. Each code can be used once if you lose
                access to your authenticator. They won&apos;t be shown again.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border bg-warning/5 p-3 text-xs text-warning flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>You can&apos;t recover your account without these if you lose your device.</span>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-4 font-mono text-sm">
              {recoveryCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <DialogFooter>
              <CopyButton
                value={recoveryCodes.join("\n")}
                label="Copy codes"
                variant="outline"
              />
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Enable two-factor</DialogTitle>
              <DialogDescription>
                Scan the setup URL in your authenticator app, then enter the
                6-digit code to confirm.
              </DialogDescription>
            </DialogHeader>

            {setupQuery.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : setupQuery.data ? (
              <div className="space-y-4">
                {/* TODO(impl): render otpauthUrl as a scannable QR code. */}
                <div className="flex aspect-square w-40 mx-auto items-center justify-center rounded-md border border-dashed text-center text-xs text-muted-foreground p-2">
                  QR code
                  <br />
                  (TODO)
                </div>
                <div className="space-y-1.5">
                  <Label>Setup URL</Label>
                  <Textarea
                    readOnly
                    rows={3}
                    value={setupQuery.data.otpauthUrl}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Manual key</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={setupQuery.data.secret}
                      className="font-mono text-xs"
                    />
                    <CopyButton
                      value={setupQuery.data.secret}
                      iconOnly
                      variant="outline"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="totp-code">Verification code</Label>
                  <Input
                    id="totp-code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    className="font-mono tracking-widest"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-destructive">
                Couldn&apos;t start setup. Please try again.
              </p>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button
                loading={enableMutation.isPending}
                disabled={code.length !== 6 || !setupQuery.data}
                onClick={() => enableMutation.mutate()}
              >
                Enable
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TotpDisableDialog({
  open,
  onOpenChange,
  onDisabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDisabled: () => Promise<void> | void;
}) {
  const [code, setCode] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.account.totpDisable(code.trim()),
    onSuccess: async () => {
      await onDisabled();
      toast.success("Two-factor authentication disabled");
      close(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Invalid code"),
  });

  function close(o: boolean) {
    if (!o) setCode("");
    onOpenChange(o);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disable two-factor</DialogTitle>
          <DialogDescription>
            Enter a current code from your authenticator to turn off two-factor
            authentication.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="totp-disable-code">Verification code</Label>
          <Input
            id="totp-disable-code"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="font-mono tracking-widest"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={mutation.isPending}
            disabled={code.length !== 6}
            onClick={() => mutation.mutate()}
          >
            Disable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Passkeys --------------------------------------------------------------

function PasskeysCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="size-4" /> Passkeys / WebAuthn
        </CardTitle>
        <CardDescription>
          Sign in with a hardware key, fingerprint or device passkey.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">No passkeys registered.</p>
        <Button
          variant="outline"
          onClick={() =>
            // TODO(impl): wire up the WebAuthn registration ceremony.
            toast.info("Passkey registration isn't wired up yet.")
          }
        >
          <Plus className="size-4" /> Add passkey
        </Button>
      </CardContent>
    </Card>
  );
}

// --- API keys --------------------------------------------------------------

function ApiKeysCard() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["account", "api-keys"],
    queryFn: () => api.account.apiKeys(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["account", "api-keys"] });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.account.revokeApiKey(id),
    onSuccess: () => {
      toast.success("API key revoked");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to revoke key"),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4" /> API keys
          </CardTitle>
          <CardDescription>
            Programmatic access tokens for the ReFx API.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> Create API key
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-5 pt-0">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : keys?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {key.prefix}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.map((s) => (
                        <Badge key={s} variant="secondary">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {key.lastUsedAt ? formatRelative(key.lastUsedAt) : "Never"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {key.expiresAt ? formatDate(key.expiresAt) : "Never"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      loading={
                        revokeMutation.isPending &&
                        revokeMutation.variables === key.id
                      }
                      onClick={() => {
                        if (
                          confirm(
                            `Revoke API key "${key.name}"? Applications using it will stop working.`,
                          )
                        ) {
                          revokeMutation.mutate(key.id);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-5 pb-5 text-sm text-muted-foreground">
            No API keys yet.
          </p>
        )}
      </CardContent>

      <CreateApiKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(token) => {
          invalidate();
          setNewToken(token);
        }}
      />

      <Dialog open={!!newToken} onOpenChange={(o) => !o && setNewToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>
              Copy this token now. For security it won&apos;t be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-warning/5 p-3 text-xs text-warning flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>Store this token securely. Anyone with it can act as you.</span>
          </div>
          <div className="flex items-center gap-2">
            <Input readOnly value={newToken ?? ""} className="font-mono text-xs" />
            <CopyButton value={newToken ?? ""} iconOnly variant="outline" />
          </div>
          <DialogFooter>
            <Button onClick={() => setNewToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const apiKeySchema = z.object({
  name: z.string().min(1, "Give the key a name"),
  scopes: z.array(z.enum(["READ", "WRITE", "ADMIN"])).min(1, "Select at least one scope"),
});
type ApiKeyValues = z.infer<typeof apiKeySchema>;

function CreateApiKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (token: string) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ApiKeyValues>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { name: "", scopes: ["READ"] },
  });

  const scopes = watch("scopes");

  const mutation = useMutation({
    mutationFn: (values: ApiKeyValues) =>
      api.account.createApiKey({ name: values.name, scopes: values.scopes }),
    onSuccess: (key) => {
      reset();
      onOpenChange(false);
      if (key.token) onCreated(key.token);
      else toast.success("API key created");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to create API key"),
  });

  function toggleScope(scope: ApiKey["scopes"][number], checked: boolean) {
    const next = checked
      ? Array.from(new Set([...scopes, scope]))
      : scopes.filter((s) => s !== scope);
    setValue("scopes", next, { shouldValidate: true });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Choose a name and the scopes this key may use.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="key-name">Name</Label>
            <Input id="key-name" placeholder="CI deploy bot" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Scopes</Label>
            <div className="space-y-2">
              {SCOPES.map((scope) => (
                <label
                  key={scope}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input accent-primary"
                    checked={scopes.includes(scope)}
                    onChange={(e) => toggleScope(scope, e.target.checked)}
                  />
                  <span className="font-medium">{scope}</span>
                </label>
              ))}
            </div>
            {errors.scopes && (
              <p className="text-xs text-destructive">{errors.scopes.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Sessions --------------------------------------------------------------

function SessionsCard() {
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["account", "sessions"],
    queryFn: () => api.account.sessions(),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.account.revokeSession(id),
    onSuccess: () => {
      toast.success("Session revoked");
      queryClient.invalidateQueries({ queryKey: ["account", "sessions"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to revoke session"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="size-4" /> Active sessions
        </CardTitle>
        <CardDescription>
          Devices currently signed in to your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))
        ) : sessions?.length ? (
          sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between gap-4 rounded-lg border p-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {session.userAgent ?? "Unknown device"}
                  </p>
                  {session.current && <Badge variant="success">Current</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {session.ip ?? "Unknown IP"} · started{" "}
                  {formatRelative(session.createdAt)}
                </p>
              </div>
              {!session.current && (
                <Button
                  variant="outline"
                  size="sm"
                  loading={
                    revokeMutation.isPending &&
                    revokeMutation.variables === session.id
                  }
                  onClick={() => {
                    if (confirm("Revoke this session? The device will be signed out.")) {
                      revokeMutation.mutate(session.id);
                    }
                  }}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No active sessions.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function CopyButton({
  value,
  label,
  iconOnly,
  variant = "outline",
}: {
  value: string;
  label?: string;
  iconOnly?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly ? "icon" : "default"}
      onClick={copy}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {!iconOnly && (label ?? "Copy")}
    </Button>
  );
}

function ListSkeletonCard() {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <Skeleton className="h-16 w-64" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
