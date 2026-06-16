"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Pencil, Trash2, Tag } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { formatMb, formatMoney } from "@/lib/utils";
import type { BillingInterval, Price, Product, ProductType } from "@/lib/types";

const TYPE_OPTIONS: { value: ProductType; label: string }[] = [
  { value: "GAME_SERVER", label: "Game server" },
  { value: "VPS", label: "VPS" },
  { value: "DEDICATED", label: "Dedicated" },
  { value: "ADDON", label: "Add-on" },
];

const INTERVALS: { value: BillingInterval; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "SEMIANNUAL", label: "Semi-annual" },
  { value: "ANNUAL", label: "Annual" },
];

function typeLabel(t: ProductType) {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}
function intervalLabel(i: BillingInterval) {
  return INTERVALS.find((o) => o.value === i)?.label ?? i;
}
function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

interface ProductForm {
  id?: string;
  name: string;
  slug: string;
  description: string;
  type: ProductType;
  cpuCores: number;
  memoryMb: number;
  diskMb: number;
  slots: number;
  isActive: boolean;
  // Per-slot (GPortal-style) pricing
  perSlot: boolean;
  gameTemplateId: string;
  minSlots: number;
  maxSlots: number;
  slotStep: number;
  cpuPerSlot: number;
  memoryMbPerSlot: number;
  diskMbPerSlot: number;
}

const emptyForm: ProductForm = {
  name: "",
  slug: "",
  description: "",
  type: "GAME_SERVER",
  cpuCores: 2,
  memoryMb: 4096,
  diskMb: 20480,
  slots: 0,
  isActive: true,
  perSlot: false,
  gameTemplateId: "",
  minSlots: 6,
  maxSlots: 100,
  slotStep: 2,
  cpuPerSlot: 0.25,
  memoryMbPerSlot: 512,
  diskMbPerSlot: 1024,
};

export default function AdminProductsPage() {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  // Whether the user manually edited the slug (so we stop auto-deriving it).
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => api.admin.products(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "products"] });

  const saveMutation = useMutation({
    mutationFn: (input: Partial<Product>) => api.admin.saveProduct(input),
    onSuccess: (saved) => {
      toast.success("Product saved");
      invalidate();
      // Keep the dialog open on first create so pricing can be added immediately.
      setForm((f) => ({ ...f, id: saved.id }));
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save product"),
  });

  const toggleMutation = useMutation({
    mutationFn: (product: Product) =>
      api.admin.saveProduct({ id: product.id, isActive: !product.isActive }),
    onSuccess: () => {
      toast.success("Product updated");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to update product"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.deleteProduct(id),
    onSuccess: () => {
      toast.success("Product deactivated");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to delete product"),
  });

  function openNew() {
    setForm(emptyForm);
    setSlugTouched(false);
    setEditOpen(true);
  }

  function openEdit(product: Product) {
    setForm({
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description ?? "",
      type: product.type,
      cpuCores: product.cpuCores ?? 0,
      memoryMb: product.memoryMb ?? 0,
      diskMb: product.diskMb ?? 0,
      slots: product.slots ?? 0,
      isActive: product.isActive,
      perSlot: product.perSlot ?? false,
      gameTemplateId: product.gameTemplateId ?? "",
      minSlots: product.minSlots ?? 1,
      maxSlots: product.maxSlots ?? 100,
      slotStep: product.slotStep ?? 1,
      cpuPerSlot: product.cpuPerSlot ?? 0,
      memoryMbPerSlot: product.memoryMbPerSlot ?? 0,
      diskMbPerSlot: product.diskMbPerSlot ?? 0,
    });
    setSlugTouched(true); // existing slug is authoritative; don't auto-rewrite
    setEditOpen(true);
  }

  // Game templates for the per-slot product → game link.
  const templatesQ = useQuery({
    queryKey: ["admin", "templates"],
    queryFn: () => api.admin.templates(),
  });

  // The currently-edited product, re-read from the cache so its prices stay live.
  const editingProduct = products?.find((p) => p.id === form.id) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Define the plans customers can order, their resources, and pricing."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> New product
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : products?.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Resources</TableHead>
                  <TableHead>Pricing</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">
                      {product.name}
                      <div className="font-mono text-xs text-muted-foreground">{product.slug}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{typeLabel(product.type)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {product.cpuCores ?? 0} vCPU ·{" "}
                      {formatMb(product.memoryMb ?? 0)} ·{" "}
                      {formatMb(product.diskMb ?? 0)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {product.prices?.length
                        ? product.prices
                            .map(
                              (p) =>
                                `${formatMoney(p.amountMinor, p.currency)}/${intervalLabel(
                                  p.interval,
                                ).toLowerCase()}`,
                            )
                            .join(" · ")
                        : "No pricing"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={product.isActive}
                        disabled={toggleMutation.isPending}
                        onCheckedChange={() => toggleMutation.mutate(product)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(product)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(product)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Create your first product so customers can place orders."
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" /> New product
            </Button>
          }
        />
      )}

      {/* Create / edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? `Edit ${form.name}` : "New product"}</DialogTitle>
            <DialogDescription>
              Configure the plan name, type, resources and pricing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="product-name">Name</Label>
                <Input
                  id="product-name"
                  placeholder="Starter Game Server"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      name: e.target.value,
                      slug: slugTouched ? f.slug : slugify(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-slug">Slug</Label>
                <Input
                  id="product-slug"
                  placeholder="starter-game-server"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: e.target.value }));
                  }}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as ProductType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="product-desc">Description</Label>
              <Textarea
                id="product-desc"
                rows={2}
                placeholder="Shown on the storefront."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="product-cpu">CPU cores</Label>
                <Input
                  id="product-cpu"
                  type="number"
                  min={0}
                  value={form.cpuCores}
                  onChange={(e) => setForm((f) => ({ ...f, cpuCores: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-slots">Slots</Label>
                <Input
                  id="product-slots"
                  type="number"
                  min={0}
                  value={form.slots}
                  onChange={(e) => setForm((f) => ({ ...f, slots: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-mem">Memory (MB)</Label>
                <Input
                  id="product-mem"
                  type="number"
                  min={0}
                  value={form.memoryMb}
                  onChange={(e) => setForm((f) => ({ ...f, memoryMb: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-disk">Disk (MB)</Label>
                <Input
                  id="product-disk"
                  type="number"
                  min={0}
                  value={form.diskMb}
                  onChange={(e) => setForm((f) => ({ ...f, diskMb: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive products are hidden from the order flow.
                </p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v: boolean) => setForm((f) => ({ ...f, isActive: v }))}
              />
            </div>

            {/* Per-slot (GPortal-style) pricing */}
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Per-slot pricing</p>
                  <p className="text-xs text-muted-foreground">
                    Customers pick a slot count on a slider; price = per-slot price ×
                    slots, resources scale per slot.
                  </p>
                </div>
                <Switch
                  checked={form.perSlot}
                  onCheckedChange={(v: boolean) => setForm((f) => ({ ...f, perSlot: v }))}
                />
              </div>

              {form.perSlot && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Game</Label>
                    <Select
                      value={form.gameTemplateId}
                      onValueChange={(v) => setForm((f) => ({ ...f, gameTemplateId: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select the game this sells" />
                      </SelectTrigger>
                      <SelectContent>
                        {(templatesQ.data ?? []).map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>Min slots</Label>
                      <Input type="number" min={1} value={form.minSlots}
                        onChange={(e) => setForm((f) => ({ ...f, minSlots: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Max slots</Label>
                      <Input type="number" min={1} value={form.maxSlots}
                        onChange={(e) => setForm((f) => ({ ...f, maxSlots: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Slider step</Label>
                      <Input type="number" min={1} value={form.slotStep}
                        onChange={(e) => setForm((f) => ({ ...f, slotStep: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>vCPU / slot</Label>
                      <Input type="number" min={0} step="0.05" value={form.cpuPerSlot}
                        onChange={(e) => setForm((f) => ({ ...f, cpuPerSlot: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>RAM MB / slot</Label>
                      <Input type="number" min={0} value={form.memoryMbPerSlot}
                        onChange={(e) => setForm((f) => ({ ...f, memoryMbPerSlot: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Disk MB / slot</Label>
                      <Input type="number" min={0} value={form.diskMbPerSlot}
                        onChange={(e) => setForm((f) => ({ ...f, diskMbPerSlot: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Set the <strong>per-slot</strong> price for each interval in Pricing
                    below (e.g. monthly per-slot rate). The order total is that × slots.
                  </p>
                </div>
              )}
            </div>

            {/* Pricing — available once the product exists. */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Tag className="size-4" /> Pricing
              </div>
              {form.id && editingProduct ? (
                <PriceEditor productId={form.id} prices={editingProduct.prices ?? []} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Save the product first, then add per-interval pricing here.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Close
            </Button>
            <Button
              loading={saveMutation.isPending}
              disabled={!form.name.trim() || !form.slug.trim()}
              onClick={() =>
                saveMutation.mutate({
                  id: form.id,
                  name: form.name,
                  slug: form.slug,
                  description: form.description || undefined,
                  type: form.type,
                  cpuCores: form.cpuCores,
                  memoryMb: form.memoryMb,
                  diskMb: form.diskMb,
                  slots: form.slots,
                  isActive: form.isActive,
                  perSlot: form.perSlot,
                  gameTemplateId: form.gameTemplateId || undefined,
                  minSlots: form.minSlots,
                  maxSlots: form.maxSlots,
                  slotStep: form.slotStep,
                  cpuPerSlot: form.cpuPerSlot,
                  memoryMbPerSlot: form.memoryMbPerSlot,
                  diskMbPerSlot: form.diskMbPerSlot,
                })
              }
            >
              {form.id ? "Save changes" : "Create product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              The product is deactivated and hidden from the storefront. Existing
              subscriptions and invoice history are preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Inline per-interval price rows with add / edit / delete. */
function PriceEditor({ productId, prices }: { productId: string; prices: Price[] }) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "products"] });

  const [interval, setInterval] = useState<BillingInterval>("MONTHLY");
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.admin.createPrice(productId, {
        interval,
        currency: currency.toUpperCase(),
        amountMinor: Math.round(parseFloat(amount || "0") * 100),
      }),
    onSuccess: () => {
      toast.success("Price added");
      setAmount("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to add price"),
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; amountMinor: number }) =>
      api.admin.updatePrice(vars.id, { amountMinor: vars.amountMinor }),
    onSuccess: () => {
      toast.success("Price updated");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to update price"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.admin.deletePrice(id),
    onSuccess: () => {
      toast.success("Price removed");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to remove price"),
  });

  return (
    <div className="space-y-2">
      {prices.length > 0 && (
        <div className="space-y-1.5">
          {prices.map((p) => (
            <PriceRow
              key={p.id}
              price={p}
              onSave={(amountMinor) => update.mutate({ id: p.id, amountMinor })}
              onDelete={() => remove.mutate(p.id)}
              saving={update.isPending}
              deleting={remove.isPending}
            />
          ))}
        </div>
      )}

      {/* Add a new price */}
      <div className="flex flex-wrap items-end gap-2 border-t pt-2">
        <div className="space-y-1">
          <Label className="text-xs">Interval</Label>
          <Select value={interval} onValueChange={(v) => setInterval(v as BillingInterval)}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Currency</Label>
          <Input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-8 w-20 font-mono uppercase"
            maxLength={3}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Amount</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="9.99"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-8 w-28"
          />
        </div>
        <Button
          size="sm"
          loading={create.isPending}
          disabled={!amount || parseFloat(amount) < 0}
          onClick={() => create.mutate()}
        >
          <Plus className="size-4" /> Add
        </Button>
      </div>
    </div>
  );
}

function PriceRow({
  price,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  price: Price;
  onSave: (amountMinor: number) => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [value, setValue] = useState((price.amountMinor / 100).toFixed(2));
  const dirty = Math.round(parseFloat(value || "0") * 100) !== price.amountMinor;

  return (
    <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
      <Badge variant="secondary" className="w-24 justify-center">
        {intervalLabel(price.interval)}
      </Badge>
      <span className="font-mono text-xs text-muted-foreground">{price.currency}</span>
      <Input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-28"
      />
      <div className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          variant={dirty ? "default" : "ghost"}
          disabled={!dirty || saving}
          onClick={() => onSave(Math.round(parseFloat(value || "0") * 100))}
        >
          Save
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={deleting}
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
