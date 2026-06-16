"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TicketPercent, Plus, Pencil, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatMoney } from "@/lib/utils";
import type { Coupon, CouponKind } from "@/lib/types";

interface Form {
  id?: string;
  code: string;
  description: string;
  kind: CouponKind;
  value: string; // percent, or dollars for fixed
  minSubtotal: string; // dollars
  maxRedemptions: string;
  maxPerUser: string;
  expiresAt: string;
  isActive: boolean;
}
const empty: Form = {
  code: "",
  description: "",
  kind: "PERCENT",
  value: "10",
  minSubtotal: "",
  maxRedemptions: "",
  maxPerUser: "",
  expiresAt: "",
  isActive: true,
};

export default function AdminCouponsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [del, setDel] = useState<Coupon | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "coupons"],
    queryFn: () => api.admin.coupons(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "coupons"] });

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<Coupon> = {
        id: form.id,
        code: form.code.trim().toUpperCase(),
        description: form.description || null,
        kind: form.kind,
        value: form.kind === "PERCENT" ? Number(form.value) : Math.round(parseFloat(form.value || "0") * 100),
        minSubtotalMinor: form.minSubtotal ? Math.round(parseFloat(form.minSubtotal) * 100) : null,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        maxPerUser: form.maxPerUser ? Number(form.maxPerUser) : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        isActive: form.isActive,
      };
      return form.id ? api.admin.updateCoupon(payload) : api.admin.createCoupon(payload);
    },
    onSuccess: () => { toast.success("Coupon saved"); setOpen(false); invalidate(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to save"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.admin.deleteCoupon(id),
    onSuccess: () => { toast.success("Coupon deleted"); setDel(null); invalidate(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to delete"),
  });

  function openNew() { setForm(empty); setOpen(true); }
  function openEdit(c: Coupon) {
    setForm({
      id: c.id,
      code: c.code,
      description: c.description ?? "",
      kind: c.kind,
      value: c.kind === "PERCENT" ? String(c.value) : (c.value / 100).toFixed(2),
      minSubtotal: c.minSubtotalMinor != null ? (c.minSubtotalMinor / 100).toFixed(2) : "",
      maxRedemptions: c.maxRedemptions != null ? String(c.maxRedemptions) : "",
      maxPerUser: c.maxPerUser != null ? String(c.maxPerUser) : "",
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "",
      isActive: c.isActive,
    });
    setOpen(true);
  }

  function discountLabel(c: Coupon) {
    return c.kind === "PERCENT" ? `${c.value}% off` : `${formatMoney(c.value, c.currency)} off`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coupons"
        description="Discount codes customers redeem at checkout — percentage or fixed amount."
        actions={<Button onClick={openNew}><Plus className="size-4" /> New coupon</Button>}
      />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : data?.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-medium">{c.code}</TableCell>
                    <TableCell>{discountLabel(c)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.timesRedeemed}{c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.expiresAt ? c.expiresAt.slice(0, 10) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.isActive ? "success" : "muted"}>{c.isActive ? "Active" : "Off"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(c)}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => setDel(c)}><Trash2 className="size-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState icon={TicketPercent} title="No coupons yet" description="Create a discount code customers can redeem." />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit coupon" : "New coupon"}</DialogTitle>
            <DialogDescription>Percentage (1–100) or a fixed amount off the order subtotal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="font-mono uppercase" />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as CouponKind }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">Percentage off</SelectItem>
                    <SelectItem value="FIXED">Fixed amount off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{form.kind === "PERCENT" ? "Percent (1–100)" : "Amount off ($)"}</Label>
                <Input type="number" min={0} step={form.kind === "PERCENT" ? "1" : "0.01"} value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Min order ($, optional)</Label>
                <Input type="number" min={0} step="0.01" value={form.minSubtotal} onChange={(e) => setForm((f) => ({ ...f, minSubtotal: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Max total uses (optional)</Label>
                <Input type="number" min={1} value={form.maxRedemptions} onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Max per customer (optional)</Label>
                <Input type="number" min={1} value={form.maxPerUser} onChange={(e) => setForm((f) => ({ ...f, maxPerUser: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Expires (optional)</Label>
                <Input type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium">Active</p>
              <Switch checked={form.isActive} onCheckedChange={(v: boolean) => setForm((f) => ({ ...f, isActive: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={save.isPending} disabled={!form.code.trim() || !form.value} onClick={() => save.mutate()}>
              {form.id ? "Save changes" : "Create coupon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {del?.code}?</DialogTitle>
            <DialogDescription>This can&apos;t be undone. Past redemptions are kept for records.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDel(null)}>Cancel</Button>
            <Button variant="destructive" loading={remove.isPending} onClick={() => del && remove.mutate(del.id)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
