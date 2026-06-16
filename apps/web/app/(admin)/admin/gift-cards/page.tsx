"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Plus, Copy, Check } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import type { GiftCard } from "@/lib/types";

export default function AdminGiftCardsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("25.00");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "gift-cards"],
    queryFn: () => api.admin.giftCards(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "gift-cards"] });

  const create = useMutation({
    mutationFn: () =>
      api.admin.createGiftCard({
        code: code.trim() || undefined,
        initialBalanceMinor: Math.round(parseFloat(amount || "0") * 100),
        note: note.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      }),
    onSuccess: (card) => {
      toast.success(`Gift card created: ${card.code}`);
      setOpen(false);
      setCode(""); setNote(""); setExpiresAt(""); setAmount("25.00");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to create"),
  });

  const toggle = useMutation({
    mutationFn: (c: GiftCard) => api.admin.updateGiftCard(c.id, { isActive: !c.isActive }),
    onSuccess: () => { toast.success("Gift card updated"); invalidate(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to update"),
  });

  function copy(c: string) {
    navigator.clipboard?.writeText(c).then(() => {
      setCopied(c);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gift cards"
        description="Issue stored-value codes customers redeem against their orders."
        actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> Issue gift card</Button>}
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
                  <TableHead>Balance</TableHead>
                  <TableHead>Initial</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <button className="inline-flex items-center gap-1.5 font-mono text-sm hover:text-foreground" onClick={() => copy(c.code)}>
                        {c.code}
                        {copied === c.code ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5 text-muted-foreground" />}
                      </button>
                      {c.note && <div className="text-xs text-muted-foreground">{c.note}</div>}
                    </TableCell>
                    <TableCell className="font-medium">{formatMoney(c.balanceMinor, c.currency)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatMoney(c.initialBalanceMinor, c.currency)}</TableCell>
                    <TableCell className="text-muted-foreground">{c.expiresAt ? c.expiresAt.slice(0, 10) : "—"}</TableCell>
                    <TableCell>
                      <Switch checked={c.isActive} disabled={toggle.isPending} onCheckedChange={() => toggle.mutate(c)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState icon={Gift} title="No gift cards yet" description="Issue a gift card with a starting balance." />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue gift card</DialogTitle>
            <DialogDescription>Leave the code blank to auto-generate one.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Balance ($)</Label>
              <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Code (optional)</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="auto-generate" className="font-mono uppercase" />
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. giveaway winner" />
            </div>
            <div className="space-y-1.5">
              <Label>Expires (optional)</Label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={create.isPending} disabled={!amount || parseFloat(amount) <= 0} onClick={() => create.mutate()}>
              Issue gift card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
