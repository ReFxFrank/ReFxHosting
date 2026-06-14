"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Pencil } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
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
import { formatMb } from "@/lib/utils";
import type { Product, ProductType } from "@/lib/types";

const TYPE_OPTIONS: { value: ProductType; label: string }[] = [
  { value: "GAME_SERVER", label: "Game server" },
  { value: "VPS", label: "VPS" },
  { value: "DEDICATED", label: "Dedicated" },
  { value: "ADDON", label: "Add-on" },
];

function typeLabel(t: ProductType) {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

interface ProductForm {
  id?: string;
  name: string;
  type: ProductType;
  cpuCores: number;
  memoryMb: number;
  diskMb: number;
  slots: number;
  isActive: boolean;
}

const emptyForm: ProductForm = {
  name: "",
  type: "GAME_SERVER",
  cpuCores: 2,
  memoryMb: 4096,
  diskMb: 20480,
  slots: 0,
  isActive: true,
};

export default function AdminProductsPage() {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => api.admin.products(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "products"] });

  const saveMutation = useMutation({
    mutationFn: (input: Partial<Product>) => api.admin.saveProduct(input),
    onSuccess: () => {
      toast.success("Product saved");
      invalidate();
      setEditOpen(false);
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

  function openNew() {
    setForm(emptyForm);
    setEditOpen(true);
  }

  function openEdit(product: Product) {
    setForm({
      id: product.id,
      name: product.name,
      type: product.type,
      cpuCores: product.cpuCores ?? 0,
      memoryMb: product.memoryMb ?? 0,
      diskMb: product.diskMb ?? 0,
      slots: product.slots ?? 0,
      isActive: product.isActive,
    });
    setEditOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Define the plans customers can order and their resource limits."
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
                  <TableHead>Slots</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{typeLabel(product.type)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {product.cpuCores ?? 0} vCPU ·{" "}
                      {formatMb(product.memoryMb ?? 0)} ·{" "}
                      {formatMb(product.diskMb ?? 0)}
                    </TableCell>
                    <TableCell className="tabular-nums text-sm text-muted-foreground">
                      {product.slots ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={product.isActive}
                        disabled={toggleMutation.isPending}
                        onCheckedChange={() => toggleMutation.mutate(product)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(product)}
                      >
                        <Pencil className="size-4" />
                      </Button>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit product" : "New product"}</DialogTitle>
            <DialogDescription>
              Configure the plan name, type and included resources.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="product-name">Name</Label>
              <Input
                id="product-name"
                placeholder="Starter Game Server"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="product-cpu">CPU cores</Label>
                <Input
                  id="product-cpu"
                  type="number"
                  min={0}
                  value={form.cpuCores}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cpuCores: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-slots">Slots</Label>
                <Input
                  id="product-slots"
                  type="number"
                  min={0}
                  value={form.slots}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, slots: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-mem">Memory (MB)</Label>
                <Input
                  id="product-mem"
                  type="number"
                  min={0}
                  value={form.memoryMb}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, memoryMb: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-disk">Disk (MB)</Label>
                <Input
                  id="product-disk"
                  type="number"
                  min={0}
                  value={form.diskMb}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, diskMb: Number(e.target.value) }))
                  }
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
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
            </div>

            {/* TODO(impl): per-interval price editing (Price[] with currency / amountMinor). */}
            <p className="text-xs text-muted-foreground">
              Pricing is managed separately. TODO(impl): inline price editor.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={saveMutation.isPending}
              disabled={!form.name.trim()}
              onClick={() =>
                saveMutation.mutate({
                  id: form.id,
                  name: form.name,
                  type: form.type,
                  cpuCores: form.cpuCores,
                  memoryMb: form.memoryMb,
                  diskMb: form.diskMb,
                  slots: form.slots,
                  isActive: form.isActive,
                })
              }
            >
              Save product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
