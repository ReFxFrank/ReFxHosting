"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Mail,
  Shield,
  Server as ServerIcon,
  CreditCard,
  ReceiptText,
  Trash2,
  Ban,
  Pause,
  Play,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Wallet,
  Plus,
  Minus,
  KeyRound,
  Copy,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps, ServerStateBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth";
import { formatDate, formatMoney } from "@/lib/utils";
import type { UserState } from "@/lib/types";

const STATE_VARIANT: Record<UserState, BadgeProps["variant"]> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  BANNED: "destructive",
  PENDING_VERIFICATION: "muted",
};

function fullName(u: { firstName: string | null; lastName: string | null }) {
  return [u.firstName, u.lastName].filter(Boolean).join(" ");
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditMode, setCreditMode] = useState<"grant" | "deduct">("grant");
  const [creditAmount, setCreditAmount] = useState("10.00");
  const [creditNote, setCreditNote] = useState("");
  const [pwOpen, setPwOpen] = useState(false);
  const [pwValue, setPwValue] = useState("");
  const [pwResult, setPwResult] = useState<string | null>(null);
  // SUPPORT staff see a read-only account view; account actions are ADMIN+.
  const canManage = useAuthStore((s) => s.hasRole("ADMIN"));

  const { data: user, isLoading } = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => api.admin.userDetail(id),
  });

  const { data: credit } = useQuery({
    queryKey: ["admin", "user", id, "credit"],
    queryFn: () => api.admin.userCredit(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
    queryClient.invalidateQueries({ queryKey: ["admin", "user", id, "credit"] });
  };

  const creditMutation = useMutation({
    mutationFn: () => {
      const cents = Math.round(parseFloat(creditAmount || "0") * 100);
      const signed = creditMode === "deduct" ? -cents : cents;
      return api.admin.grantCredit(id, {
        amountMinor: signed,
        reason: creditMode === "deduct" ? "ADJUSTMENT" : "ADMIN_GRANT",
        note: creditNote.trim() || undefined,
      });
    },
    onSuccess: (res) => {
      toast.success(`Credit updated — new balance ${formatMoney(res.balanceMinor, "USD")}`);
      setCreditOpen(false);
      setCreditNote("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to update credit"),
  });

  const openCredit = (mode: "grant" | "deduct") => {
    setCreditMode(mode);
    setCreditAmount("10.00");
    setCreditNote("");
    setCreditOpen(true);
  };

  const stateMutation = useMutation({
    mutationFn: (state: UserState) => api.admin.setUserState(id, state),
    onSuccess: () => {
      toast.success("Account updated");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to update account"),
  });

  const verifyEmail = useMutation({
    mutationFn: () => api.admin.verifyUserEmail(id),
    onSuccess: () => {
      toast.success("Email marked verified");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to verify email"),
  });

  const sendResetMutation = useMutation({
    mutationFn: () => api.admin.sendUserPasswordReset(id),
    onSuccess: () => {
      toast.success("Password reset email sent to the user");
      setPwOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to send reset"),
  });

  const setPasswordMutation = useMutation({
    mutationFn: () => api.admin.setUserPassword(id, pwValue.trim() || undefined),
    onSuccess: (res) => {
      setPwResult(res.password);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to set password"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.admin.deleteUser(id),
    onSuccess: () => {
      toast.success("User deleted");
      router.push("/admin/users");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to delete user"),
  });

  const purgeMutation = useMutation({
    mutationFn: () => api.admin.purgeUser(id),
    onSuccess: () => {
      toast.success("Personal data purged");
      setConfirmPurge(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to purge data"),
  });

  if (isLoading || !user) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-1" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
        <Link href="/admin/users">
          <ArrowLeft className="size-4" /> All users
        </Link>
      </Button>

      <PageHeader
        title={fullName(user) || user.email}
        description={user.email}
        actions={
          !canManage ? undefined : (
          <div className="flex flex-wrap items-center gap-2">
            {user.state !== "ACTIVE" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => stateMutation.mutate("ACTIVE")}
                loading={stateMutation.isPending}
              >
                <Play className="size-4" /> Activate
              </Button>
            )}
            {user.state !== "SUSPENDED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => stateMutation.mutate("SUSPENDED")}
              >
                <Pause className="size-4" /> Suspend
              </Button>
            )}
            {user.state !== "BANNED" && (
              <Button variant="outline" size="sm" onClick={() => stateMutation.mutate("BANNED")}>
                <Ban className="size-4" /> Ban
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPwValue("");
                setPwResult(null);
                setPwOpen(true);
              }}
            >
              <KeyRound className="size-4" /> Password
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmPurge(true)}>
              <ShieldAlert className="size-4" /> Purge data
            </Button>
          </div>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Contact / profile */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="size-4" /> Contact & account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Status">
              <Badge variant={STATE_VARIANT[user.state] ?? "secondary"}>{user.state}</Badge>
            </Row>
            <Row label="Role">
              <span className="flex items-center gap-1.5">
                <Shield className="size-3.5 text-muted-foreground" /> {user.globalRole}
              </span>
            </Row>
            <Row label="Email">
              <span className="flex items-center gap-1.5">
                {user.email}
                {user.emailVerifiedAt ? (
                  <CheckCircle2 className="size-3.5 text-success" />
                ) : (
                  <XCircle className="size-3.5 text-warning" />
                )}
              </span>
            </Row>
            {!user.emailVerifiedAt && canManage && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning/5 px-2.5 py-2">
                <span className="text-xs text-muted-foreground">
                  Email not verified.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  loading={verifyEmail.isPending}
                  onClick={() => verifyEmail.mutate()}
                >
                  <CheckCircle2 className="size-4" /> Mark verified
                </Button>
              </div>
            )}
            <Row label="Name">{fullName(user) || "—"}</Row>
            <Row label="2FA">
              <span className="flex items-center gap-1.5">
                {user.totpEnabledAt ? (
                  <>
                    <ShieldCheck className="size-3.5 text-success" /> Enabled
                  </>
                ) : (
                  "Off"
                )}
              </span>
            </Row>
            {user.phone && <Row label="Phone">{user.phone}</Row>}
            <Row label="Locale">{user.locale}</Row>
            <Row label="Timezone">{user.timezone}</Row>
            <Row label="Joined">{formatDate(user.createdAt)}</Row>
            {(user.addressLine1 || user.city || user.country) && (
              <div className="border-t pt-3">
                <p className="refx-eyebrow mb-1">Address</p>
                <address className="not-italic text-sm leading-relaxed text-foreground">
                  {user.addressLine1 && <div>{user.addressLine1}</div>}
                  {user.addressLine2 && <div>{user.addressLine2}</div>}
                  {(user.city || user.region || user.postalCode) && (
                    <div>
                      {[user.city, user.region, user.postalCode].filter(Boolean).join(", ")}
                    </div>
                  )}
                  {user.country && <div>{user.country}</div>}
                </address>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Billing + servers */}
        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <Mini label="Servers" value={user._count?.ownedServers ?? 0} icon={ServerIcon} />
            <Mini
              label="Subscriptions"
              value={user._count?.subscriptions ?? 0}
              icon={CreditCard}
            />
            <Mini label="Tickets" value={user._count?.tickets ?? 0} icon={ReceiptText} />
          </div>

          <Section title="Servers" icon={ServerIcon}>
            {user.ownedServers?.length ? (
              <SimpleTable head={["Name", "Short ID", "Node", "State"]}>
                {user.ownedServers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {s.shortId}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.node?.name ?? "—"}</TableCell>
                    <TableCell>
                      <ServerStateBadge state={s.state} />
                    </TableCell>
                  </TableRow>
                ))}
              </SimpleTable>
            ) : (
              <Empty>No servers.</Empty>
            )}
          </Section>

          <Section title="Subscriptions" icon={CreditCard}>
            {user.subscriptions?.length ? (
              <SimpleTable head={["Product", "Status", "Interval", "Renews"]}>
                {user.subscriptions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">{sub.product?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{sub.state}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{sub.interval}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {sub.cancelAtPeriodEnd ? "Cancels" : formatDate(sub.currentPeriodEnd)}
                    </TableCell>
                  </TableRow>
                ))}
              </SimpleTable>
            ) : (
              <Empty>No subscriptions.</Empty>
            )}
          </Section>

          <Section title="Invoices" icon={ReceiptText}>
            {user.invoices?.length ? (
              <SimpleTable head={["Number", "Status", "Total", "Issued"]}>
                {user.invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{inv.state}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatMoney(inv.totalMinor, inv.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(inv.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </SimpleTable>
            ) : (
              <Empty>No invoices.</Empty>
            )}
          </Section>

          {!!user.paymentMethods?.length && (
            <Section title="Payment methods" icon={CreditCard}>
              <div className="flex flex-wrap gap-2">
                {user.paymentMethods.map((pm) => (
                  <Badge key={pm.id} variant="outline" className="gap-1.5">
                    <span className="capitalize">{pm.brand ?? pm.gateway}</span>
                    {pm.last4 && <span className="font-mono">•••• {pm.last4}</span>}
                    {pm.isDefault && <span className="text-[hsl(var(--primary))]">default</span>}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          {/* Store / account credit */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Wallet className="size-4" /> Account credit
              </CardTitle>
              {canManage && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openCredit("grant")}>
                    <Plus className="size-4" /> Grant
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={(credit?.balanceMinor ?? 0) <= 0}
                    onClick={() => openCredit("deduct")}
                  >
                    <Minus className="size-4" /> Deduct
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="refx-eyebrow">Balance</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatMoney(credit?.balanceMinor ?? user.creditBalanceMinor ?? 0, "USD")}
                </p>
              </div>
              {!!credit?.transactions?.length && (
                <div className="border-t pt-2">
                  <p className="refx-eyebrow mb-1">Recent activity</p>
                  <div className="space-y-1.5">
                    {credit.transactions.slice(0, 8).map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {t.reason.replace(/_/g, " ").toLowerCase()}
                          {t.note ? ` · ${t.note}` : ""}
                        </span>
                        <span
                          className={
                            t.amountMinor >= 0
                              ? "tabular-nums text-success"
                              : "tabular-nums text-muted-foreground"
                          }
                        >
                          {t.amountMinor >= 0 ? "+" : "−"}
                          {formatMoney(Math.abs(t.amountMinor), "USD")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {creditMode === "grant" ? "Grant credit" : "Deduct credit"}
            </DialogTitle>
            <DialogDescription>
              {creditMode === "grant"
                ? "Add store credit to this account (e.g. a refund or goodwill gesture). It applies automatically at the customer's next checkout."
                : "Remove store credit from this account. Cannot reduce the balance below zero."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Amount ($)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input
                value={creditNote}
                onChange={(e) => setCreditNote(e.target.value)}
                placeholder="e.g. refund for INV-2026-0007"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreditOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={creditMutation.isPending}
              disabled={!creditAmount || parseFloat(creditAmount) <= 0}
              onClick={() => creditMutation.mutate()}
            >
              {creditMode === "grant" ? "Grant credit" : "Deduct credit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password management */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password — {fullName(user) || user.email}</DialogTitle>
            <DialogDescription>
              Email the user a reset link (recommended), or set a temporary password they must
              change on next sign-in. Either way, the user&apos;s active sessions are ended.
            </DialogDescription>
          </DialogHeader>

          {pwResult ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Temporary password set. <strong>Copy it now — it won&apos;t be shown again.</strong>{" "}
                The user must change it at next sign-in.
              </p>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
                <code className="flex-1 break-all font-mono text-sm">{pwResult}</code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(pwResult).then(
                      () => toast.success("Copied"),
                      () => toast.error("Copy failed"),
                    );
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setPwOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <Button
                  className="w-full"
                  loading={sendResetMutation.isPending}
                  onClick={() => sendResetMutation.mutate()}
                >
                  <Mail className="size-4" /> Send password reset email
                </Button>
                <p className="text-xs text-muted-foreground">
                  The user sets their own password from the link. You never see it.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="temp-pw">Temporary password</Label>
                <Input
                  id="temp-pw"
                  type="text"
                  autoComplete="off"
                  placeholder="Leave blank to auto-generate a strong one"
                  value={pwValue}
                  onChange={(e) => setPwValue(e.target.value)}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  loading={setPasswordMutation.isPending}
                  onClick={() => setPasswordMutation.mutate()}
                >
                  <KeyRound className="size-4" /> Set temporary password
                </Button>
                <p className="text-xs text-muted-foreground">
                  Ends all sessions and forces a change on next sign-in. The user is emailed a notice.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {fullName(user) || user.email}?</DialogTitle>
            <DialogDescription>
              This soft-deletes the account and bans it. A user who still owns servers
              can&apos;t be deleted — remove or transfer their servers first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmPurge} onOpenChange={setConfirmPurge}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purge personal data?</DialogTitle>
            <DialogDescription>
              GDPR erasure: permanently anonymizes this user&apos;s personal data
              (name, contact, address) and removes login credentials, passkeys, API
              keys and saved cards. Invoices/payments are kept for legal records.
              This can&apos;t be undone, and is blocked while they own active servers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmPurge(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={purgeMutation.isPending}
              onClick={() => purgeMutation.mutate()}
            >
              Purge data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function Mini({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-3">
        <div>
          <p className="refx-eyebrow">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
        <Icon className="size-5 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

function SimpleTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {head.map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
