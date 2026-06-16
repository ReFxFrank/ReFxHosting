"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startRegistration } from "@simplewebauthn/browser";
import QRCode from "qrcode";
import { Controller, useForm } from "react-hook-form";
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
  Download,
  ShieldAlert,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES, US_STATES } from "@/lib/geo";
import { TIMEZONES } from "@/lib/timezones";
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
import { cn, formatRelative, formatDate, initials, copyToClipboard } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import type { ApiKey, User } from "@/lib/types";

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
  timezone: z.string().min(1, "Required"),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});
type ProfileValues = z.infer<typeof profileSchema>;

function ProfileTab() {
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      timezone: user?.timezone ?? "",
      phone: user?.phone ?? "",
      addressLine1: user?.addressLine1 ?? "",
      addressLine2: user?.addressLine2 ?? "",
      city: user?.city ?? "",
      region: user?.region ?? "",
      postalCode: user?.postalCode ?? "",
      country: user?.country ?? "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: ProfileValues) => api.account.update(values),
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
        <AvatarEditor user={user} onChanged={refreshUser} fullName={fullName} />

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
              <Label htmlFor="timezone">Timezone</Label>
              <Controller
                control={control}
                name="timezone"
                render={({ field }) => (
                  <Select value={field.value || "UTC"} onValueChange={field.onChange}>
                    <SelectTrigger id="timezone">
                      <SelectValue placeholder="Select timezone…" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.timezone && (
                <p className="text-xs text-destructive">{errors.timezone.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5 border-t pt-5">
            <p className="text-sm font-medium">Contact & billing address</p>
            <p className="text-xs text-muted-foreground">
              Optional — used for support and billing. We never share it.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" placeholder="+1 555 123 4567" {...register("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Controller
                control={control}
                name="country"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger id="country"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="addressLine1">Address line 1</Label>
              <Input id="addressLine1" {...register("addressLine1")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="addressLine2">Address line 2</Label>
              <Input id="addressLine2" {...register("addressLine2")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" {...register("city")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="region">State / province</Label>
              {watch("country") === "US" ? (
                <Controller
                  control={control}
                  name="region"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger id="region"><SelectValue placeholder="Select state…" /></SelectTrigger>
                      <SelectContent>
                        {US_STATES.map((s) => (
                          <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : (
                <Input id="region" {...register("region")} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="postalCode">Postal code</Label>
              <Input id="postalCode" {...register("postalCode")} />
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

/**
 * Downscale a chosen image to a small square data URL entirely in the browser,
 * so uploads stay tiny regardless of the source file.
 */
function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't a valid image"));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unsupported"));
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function AvatarEditor({
  user,
  onChanged,
  fullName,
}: {
  user: User;
  onChanged: () => Promise<void> | void;
  fullName: string;
}) {
  const [urlInput, setUrlInput] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isUploaded = (user.avatarUrl ?? "").startsWith("data:");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Please choose an image under 8 MB");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      await api.account.uploadAvatar(dataUrl);
      await onChanged();
      toast.success("Profile picture updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(avatarUrl: string) {
    setBusy(true);
    try {
      await api.account.update({ avatarUrl });
      await onChanged();
      toast.success(avatarUrl ? "Profile picture updated" : "Profile picture removed");
      setUrlInput("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update picture");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar className="size-16 text-base">
        {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={fullName} />}
        <AvatarFallback>{initials(fullName, user.email)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <p className="font-medium">{fullName || user.email}</p>
          {user.emailVerifiedAt ? (
            <Badge variant="success">Verified</Badge>
          ) : (
            <Badge variant="warning">Unverified</Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={onFile}
          />
          <Button type="button" variant="outline" size="sm" loading={busy} onClick={() => fileRef.current?.click()}>
            <Plus className="size-4" /> Upload
          </Button>
          {user.avatarUrl && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => save("")}>
              Remove
            </Button>
          )}
          {!isUploaded && (
            <span className="flex items-center gap-2">
              <Input
                placeholder="…or paste an image URL"
                className="h-8 w-56 text-xs"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || !/^https?:\/\//i.test(urlInput.trim())}
                onClick={() => save(urlInput.trim())}
              >
                Set
              </Button>
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          JPG, PNG, WebP or GIF — auto-cropped to a square and resized.
        </p>
      </div>
    </div>
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
      <PrivacyCard />
    </div>
  );
}

function PrivacyCard() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [ack, setAck] = useState("");

  async function exportData() {
    setExporting(true);
    try {
      const data = await api.account.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `refx-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const del = useMutation({
    mutationFn: () => api.account.deleteAccount(),
    onSuccess: async () => {
      toast.success("Your account has been deleted");
      await logout();
      router.replace("/login");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't delete account"),
  });

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="size-4" /> Privacy & data
        </CardTitle>
        <CardDescription>
          Download everything we hold about you, or permanently close your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" loading={exporting} onClick={exportData}>
          <Download className="size-4" /> Download my data
        </Button>
        <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="size-4" /> Delete account
        </Button>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (!o) setAck(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This closes your account and revokes access. You can&apos;t do this while
              you still own active servers — cancel or remove them first. Type{" "}
              <span className="font-mono font-semibold">DELETE</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input value={ack} onChange={(e) => setAck(e.target.value)} placeholder="DELETE" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={del.isPending}
              disabled={ack !== "DELETE"}
              onClick={() => del.mutate()}
            >
              Delete my account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
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
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const setupQuery = useQuery({
    queryKey: ["account", "totp", "setup"],
    queryFn: () => api.account.totpSetup(),
    enabled: open && !recoveryCodes,
    staleTime: 0,
    gcTime: 0,
  });

  // Render the otpauth:// URL as a scannable QR for Authy / Google Authenticator.
  const otpauthUrl = setupQuery.data?.otpauthUrl;
  useEffect(() => {
    if (!otpauthUrl) {
      setQrDataUrl(null);
      return;
    }
    let active = true;
    QRCode.toDataURL(otpauthUrl, { margin: 1, width: 320 })
      .then((url) => active && setQrDataUrl(url))
      .catch(() => active && setQrDataUrl(null));
    return () => {
      active = false;
    };
  }, [otpauthUrl]);

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
                <p className="text-center text-xs text-muted-foreground">
                  Scan with Authy, Google Authenticator, 1Password or any TOTP app.
                </p>
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="TOTP QR code"
                    className="mx-auto size-44 rounded-md border bg-white p-2"
                  />
                ) : (
                  <Skeleton className="mx-auto size-44 rounded-md" />
                )}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">Can&apos;t scan? Enter the setup URL manually</summary>
                  <Textarea
                    readOnly
                    rows={3}
                    value={setupQuery.data.otpauthUrl}
                    className="mt-2 font-mono text-xs"
                  />
                </details>
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
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: passkeys, isLoading } = useQuery({
    queryKey: ["account", "passkeys"],
    queryFn: () => api.account.passkeys(),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["account", "passkeys"] });

  async function addPasskey() {
    setAdding(true);
    try {
      const options = await api.account.passkeyRegisterOptions();
      const attestation = await startRegistration(
        options as Parameters<typeof startRegistration>[0],
      );
      const label =
        typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
          ? "Apple device"
          : undefined;
      await api.account.passkeyRegisterVerify(attestation, label);
      toast.success("Passkey added");
      invalidate();
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") return; // cancelled
      toast.error(e instanceof ApiError ? e.message : "Couldn't add passkey");
    } finally {
      setAdding(false);
    }
  }

  const remove = useMutation({
    mutationFn: (id: string) => api.account.deletePasskey(id),
    onSuccess: () => {
      toast.success("Passkey removed");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't remove passkey"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="size-4" /> Passkeys / WebAuthn
        </CardTitle>
        <CardDescription>
          Sign in with a hardware key, fingerprint or device passkey. Passkeys act
          as a second factor at sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : passkeys?.length ? (
          <ul className="divide-y rounded-md border">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.label || "Passkey"}</p>
                  <p className="text-xs text-muted-foreground">
                    Added {formatDate(p.createdAt)}
                    {p.lastUsedAt ? ` · last used ${formatDate(p.lastUsedAt)}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  aria-label="Remove passkey"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(p.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No passkeys registered.</p>
        )}
        <Button variant="outline" loading={adding} onClick={addPasskey}>
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
      if (!(await copyToClipboard(value))) throw new Error("copy failed");
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
