"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, Pencil, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { formatMb, cn } from "@/lib/utils";
import { GameImage } from "@/components/public/game-image";
import type { GameTemplate } from "@/lib/types";

const IMAGE_PRESETS = [
  "/games/presets/default.svg",
  "/games/presets/survival.svg",
  "/games/presets/sandbox.svg",
  "/games/presets/shooter.svg",
];

interface TemplateForm {
  id?: string;
  name: string;
  slug: string;
  author: string;
  description: string;
  startupCommand: string;
  stopCommand: string;
  dockerImagesJson: string;
  recCpuCores: number;
  recMemoryMb: number;
  recDiskMb: number;
  supportsLinux: boolean;
  supportsWindows: boolean;
  // Storefront metadata
  isPublished: boolean;
  featured: boolean;
  sortOrder: number;
  longDescription: string;
  cardImageUrl: string;
  heroImageUrl: string;
  iconUrl: string;
  tags: string; // comma-separated in the form
}

const emptyForm: TemplateForm = {
  name: "",
  slug: "",
  author: "",
  description: "",
  startupCommand: "",
  stopCommand: "",
  dockerImagesJson: "{}",
  recCpuCores: 2,
  recMemoryMb: 4096,
  recDiskMb: 10240,
  supportsLinux: true,
  supportsWindows: false,
  isPublished: false,
  featured: false,
  sortOrder: 0,
  longDescription: "",
  cardImageUrl: "",
  heroImageUrl: "",
  iconUrl: "",
  tags: "",
};

export default function AdminTemplatesPage() {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<GameTemplate | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["admin", "templates"],
    queryFn: () => api.admin.templates(),
  });

  const saveMutation = useMutation({
    mutationFn: (input: Partial<GameTemplate>) => api.admin.saveTemplate(input),
    onSuccess: () => {
      toast.success("Template saved");
      queryClient.invalidateQueries({ queryKey: ["admin", "templates"] });
      setEditOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save template"),
  });

  // Inline publish toggle from the table (doesn't open the editor).
  const publishMutation = useMutation({
    mutationFn: (input: { id: string; isPublished: boolean }) =>
      api.admin.saveTemplate(input),
    onSuccess: (_d, vars) => {
      toast.success(vars.isPublished ? "Published to storefront" : "Hidden from storefront");
      queryClient.invalidateQueries({ queryKey: ["admin", "templates"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to update visibility"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.deleteTemplate(id),
    onSuccess: () => {
      toast.success("Egg deleted — it won't return on the next reseed.");
      queryClient.invalidateQueries({ queryKey: ["admin", "templates"] });
      setDeleteTarget(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to delete egg"),
  });

  function openNew() {
    setForm(emptyForm);
    setEditOpen(true);
  }

  function openEdit(t: GameTemplate) {
    setForm({
      id: t.id,
      name: t.name,
      slug: t.slug,
      author: t.author,
      description: t.description ?? "",
      startupCommand: t.startupCommand,
      stopCommand: "",
      dockerImagesJson: JSON.stringify(t.dockerImages ?? {}, null, 2),
      recCpuCores: t.recCpuCores,
      recMemoryMb: t.recMemoryMb,
      recDiskMb: t.recDiskMb,
      supportsLinux: t.supportsLinux,
      supportsWindows: t.supportsWindows,
      isPublished: t.isPublished ?? false,
      featured: t.featured ?? false,
      sortOrder: t.sortOrder ?? 0,
      longDescription: t.longDescription ?? "",
      cardImageUrl: t.cardImageUrl ?? "",
      heroImageUrl: t.heroImageUrl ?? "",
      iconUrl: t.iconUrl ?? "",
      tags: (t.tags ?? []).join(", "),
    });
    setEditOpen(true);
  }

  function handleSave() {
    let dockerImages: Record<string, string>;
    try {
      const parsed = JSON.parse(form.dockerImagesJson || "{}");
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Docker images must be a JSON object");
      }
      dockerImages = parsed as Record<string, string>;
    } catch {
      toast.error("Docker images must be valid JSON (e.g. { \"latest\": \"image:tag\" })");
      return;
    }

    saveMutation.mutate({
      id: form.id,
      name: form.name,
      slug: form.slug,
      author: form.author,
      description: form.description || null,
      startupCommand: form.startupCommand,
      dockerImages,
      recCpuCores: form.recCpuCores,
      recMemoryMb: form.recMemoryMb,
      recDiskMb: form.recDiskMb,
      supportsLinux: form.supportsLinux,
      supportsWindows: form.supportsWindows,
      isPublished: form.isPublished,
      featured: form.featured,
      sortOrder: Number(form.sortOrder) || 0,
      longDescription: form.longDescription || null,
      cardImageUrl: form.cardImageUrl || null,
      heroImageUrl: form.heroImageUrl || null,
      iconUrl: form.iconUrl || null,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      // stopCommand is part of the larger config payload. TODO(impl).
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Eggs"
        description="Game templates (eggs) used to install and run games on nodes."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> New template
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : templates?.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Deploy</TableHead>
                  <TableHead>Recommended</TableHead>
                  <TableHead>Public</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono text-xs">{t.slug}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.author}
                    </TableCell>
                    <TableCell className="tabular-nums text-sm text-muted-foreground">
                      v{t.version}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {t.deployMethods.map((m) => (
                          <Badge key={m} variant="secondary">
                            {m}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.recCpuCores} vCPU · {formatMb(t.recMemoryMb)} ·{" "}
                      {formatMb(t.recDiskMb)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={t.isPublished ?? false}
                          disabled={publishMutation.isPending}
                          onCheckedChange={(v: boolean) =>
                            publishMutation.mutate({ id: t.id, isPublished: v })
                          }
                          aria-label="Show on storefront"
                        />
                        {t.featured && <Badge variant="secondary">Featured</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(t)}
                          aria-label="Edit egg"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(t)}
                          aria-label="Delete egg"
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
          icon={Layers}
          title="No templates yet"
          description="Create your first game template to make games available for deployment."
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" /> New template
            </Button>
          }
        />
      )}

      {/* Create / edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90svh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit template" : "New template"}</DialogTitle>
            <DialogDescription>
              Configure the core metadata and runtime for this game egg.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Name</Label>
                <Input
                  id="tpl-name"
                  placeholder="Minecraft Java"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-slug">Slug</Label>
                <Input
                  id="tpl-slug"
                  placeholder="minecraft-java"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-author">Author</Label>
              <Input
                id="tpl-author"
                placeholder="ReFx"
                value={form.author}
                onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-desc">Description</Label>
              <Textarea
                id="tpl-desc"
                placeholder="Short description of the game template…"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-startup">Startup command</Label>
              <Textarea
                id="tpl-startup"
                placeholder="java -Xms128M -Xmx{{MEMORY}}M -jar server.jar"
                value={form.startupCommand}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startupCommand: e.target.value }))
                }
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-stop">Stop command</Label>
              <Textarea
                id="tpl-stop"
                placeholder="stop"
                value={form.stopCommand}
                onChange={(e) =>
                  setForm((f) => ({ ...f, stopCommand: e.target.value }))
                }
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-images">Docker images (JSON)</Label>
              <Textarea
                id="tpl-images"
                placeholder={`{\n  "latest": "ghcr.io/refx/minecraft:latest"\n}`}
                value={form.dockerImagesJson}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dockerImagesJson: e.target.value }))
                }
                className="min-h-[120px] font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Map of display name to image reference. Must be valid JSON.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-cpu">Rec. CPU cores</Label>
                <Input
                  id="tpl-cpu"
                  type="number"
                  min={0}
                  value={form.recCpuCores}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, recCpuCores: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-mem">Rec. memory (MB)</Label>
                <Input
                  id="tpl-mem"
                  type="number"
                  min={0}
                  value={form.recMemoryMb}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, recMemoryMb: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-disk">Rec. disk (MB)</Label>
                <Input
                  id="tpl-disk"
                  type="number"
                  min={0}
                  value={form.recDiskMb}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, recDiskMb: Number(e.target.value) }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex flex-1 items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Supports Linux</span>
                <Switch
                  checked={form.supportsLinux}
                  onCheckedChange={(v: boolean) =>
                    setForm((f) => ({ ...f, supportsLinux: v }))
                  }
                />
              </div>
              <div className="flex flex-1 items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Supports Windows</span>
                <Switch
                  checked={form.supportsWindows}
                  onCheckedChange={(v: boolean) =>
                    setForm((f) => ({ ...f, supportsWindows: v }))
                  }
                />
              </div>
            </div>

            {/* ---- Public storefront --------------------------------------- */}
            <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div>
                <p className="text-sm font-semibold">Public storefront</p>
                <p className="text-xs text-muted-foreground">
                  Controls how this game appears on the public site. Unpublished games
                  stay hidden from customers but remain here.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex flex-1 items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">Published</span>
                  <Switch
                    checked={form.isPublished}
                    onCheckedChange={(v: boolean) =>
                      setForm((f) => ({ ...f, isPublished: v }))
                    }
                  />
                </div>
                <div className="flex flex-1 items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">Featured</span>
                  <Switch
                    checked={form.featured}
                    onCheckedChange={(v: boolean) =>
                      setForm((f) => ({ ...f, featured: v }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:w-32">
                  <Label htmlFor="tpl-sort">Sort order</Label>
                  <Input
                    id="tpl-sort"
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tpl-long">Long description (detail page)</Label>
                <Textarea
                  id="tpl-long"
                  placeholder="Marketing copy shown on the game's detail page…"
                  value={form.longDescription}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, longDescription: e.target.value }))
                  }
                  className="min-h-[80px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tpl-tags">Tags (comma-separated)</Label>
                <Input
                  id="tpl-tags"
                  placeholder="survival, multiplayer, modded"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Card image</Label>
                <div className="flex flex-wrap gap-2">
                  {IMAGE_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          cardImageUrl: p,
                          heroImageUrl: f.heroImageUrl || p,
                        }))
                      }
                      className={cn(
                        "h-12 w-20 overflow-hidden rounded-md border",
                        form.cardImageUrl === p
                          ? "border-primary refx-glow"
                          : "border-white/10",
                      )}
                    >
                      <GameImage src={p} alt="preset" />
                    </button>
                  ))}
                </div>
                <Input
                  placeholder="…or paste a custom card image URL"
                  value={form.cardImageUrl}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cardImageUrl: e.target.value }))
                  }
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-hero">Hero image URL</Label>
                  <Input
                    id="tpl-hero"
                    placeholder="/games/presets/survival.svg"
                    value={form.heroImageUrl}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, heroImageUrl: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-icon">Icon URL</Label>
                  <Input
                    id="tpl-icon"
                    placeholder="optional"
                    value={form.iconUrl}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, iconUrl: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Card preview</Label>
                <div className="max-w-[260px] overflow-hidden rounded-2xl border border-white/[0.06]">
                  <div className="relative aspect-[16/9]">
                    <GameImage src={form.cardImageUrl} alt={form.name || "preview"} />
                  </div>
                  <div className="p-3">
                    <p className="font-semibold">{form.name || "Game name"}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {form.description || "Short description"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* TODO(impl): full editor for variables, install script and config files —
                this is a large surface and is stubbed for now. */}
            <p className="text-xs text-muted-foreground">
              TODO(impl): variable, install-script and config-file editors are not yet
              available here.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={saveMutation.isPending}
              disabled={!form.name.trim() || !form.slug.trim()}
              onClick={handleSave}
            >
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete egg confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              This removes the egg from the panel. It will <strong>not</strong> come
              back on the next deploy/reseed. Eggs in use by existing servers
              can&apos;t be deleted. You can re-add it later by creating an egg with the
              same slug.
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
              Delete egg
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
