"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Folder,
  File as FileIcon,
  FolderPlus,
  Upload,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
  Download,
  FileArchive,
  FolderInput,
  ChevronRight,
  HardDrive,
  ArrowLeft,
  Save,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { cn, formatBytes, formatRelative } from "@/lib/utils";
import type { FileEntry } from "@/lib/types";

/** Join a directory path with a child name into a normalized absolute path. */
function joinPath(dir: string, name: string) {
  const base = dir.endsWith("/") ? dir : `${dir}/`;
  return `${base}${name}`.replace(/\/+/g, "/");
}

/** Parent directory of an absolute path. */
function parentPath(path: string) {
  if (path === "/" || path === "") return "/";
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx <= 0 ? "/" : trimmed.slice(0, idx);
}

const TEXT_EXT =
  /\.(txt|log|json|ya?ml|toml|ini|cfg|conf|properties|env|md|xml|html?|css|js|ts|jsx|tsx|sh|bash|py|lua|sql|csv|gitignore|dockerfile)$/i;

function isEditable(entry: FileEntry) {
  if (!entry.isFile) return false;
  if (entry.mimeType?.startsWith("text/")) return true;
  if (entry.mimeType === "application/json" || entry.mimeType === "application/xml")
    return true;
  return TEXT_EXT.test(entry.name);
}

function isArchive(name: string) {
  return /\.(zip|tar|tar\.gz|tgz|tar\.bz2|gz|rar|7z)$/i.test(name);
}

export default function FilesPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [path, setPath] = useState("/");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Inline editor view state.
  const [editing, setEditing] = useState<FileEntry | null>(null);
  const [draft, setDraft] = useState("");

  // Dialog state.
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirName, setMkdirName] = useState("");
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);

  const {
    data: entries,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["files", id, path],
    queryFn: () => api.servers.files.list(id, path),
  });

  const segments = useMemo(() => {
    const parts = path.split("/").filter(Boolean);
    const crumbs: { label: string; path: string }[] = [{ label: "root", path: "/" }];
    let acc = "";
    for (const part of parts) {
      acc += `/${part}`;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }, [path]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["files", id, path] });
  }

  function navigate(to: string) {
    setSelected(new Set());
    setPath(to);
  }

  // -- mutations ------------------------------------------------------------
  const mkdirMutation = useMutation({
    mutationFn: (name: string) => api.servers.files.mkdir(id, joinPath(path, name)),
    onSuccess: () => {
      toast.success("Folder created");
      setMkdirOpen(false);
      setMkdirName("");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to create folder"),
  });

  const renameMutation = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      api.servers.files.rename(id, from, to),
    onSuccess: () => {
      toast.success("Renamed");
      setRenameTarget(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to rename"),
  });

  const deleteMutation = useMutation({
    mutationFn: (paths: string[]) => api.servers.files.delete(id, paths),
    onSuccess: (_data, paths) => {
      toast.success(paths.length > 1 ? `${paths.length} items deleted` : "Deleted");
      setDeleteTargets(null);
      setSelected(new Set());
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to delete"),
  });

  const compressMutation = useMutation({
    mutationFn: (paths: string[]) => api.servers.files.compress(id, paths),
    onSuccess: () => {
      toast.success("Archive created");
      setSelected(new Set());
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to compress"),
  });

  const decompressMutation = useMutation({
    mutationFn: (target: string) => api.servers.files.decompress(id, target),
    onSuccess: () => {
      toast.success("Archive extracted");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to extract"),
  });

  const downloadMutation = useMutation({
    mutationFn: (target: string) => api.servers.files.downloadUrl(id, target),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to get download link"),
  });

  const saveMutation = useMutation({
    mutationFn: () => api.servers.files.write(id, editing!.path, draft),
    onSuccess: () => {
      toast.success("File saved");
      setEditing(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to save file"),
  });

  // -- editor opening -------------------------------------------------------
  async function openFile(entry: FileEntry) {
    try {
      const content = await api.servers.files.read(id, entry.path);
      setDraft(content);
      setEditing(entry);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to open file");
    }
  }

  function handleUpload() {
    // TODO(impl): request a signed URL via api.servers.files.uploadUrl(id, path)
    // and PUT the selected File to it (tus/multipart). Placeholder for now.
    toast.info("Direct upload is coming soon. Use SFTP for large files in the meantime.");
  }

  // -- selection helpers ----------------------------------------------------
  const allSelected = !!entries?.length && entries.every((e) => selected.has(e.path));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(entries?.map((e) => e.path) ?? []));
  }

  function toggleOne(p: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  // -- inline editor view ---------------------------------------------------
  if (editing) {
    return (
      <div className="space-y-4">
        <PageHeader
          title={editing.name}
          description={editing.path}
          actions={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                <ArrowLeft className="size-4" /> Cancel
              </Button>
              <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                <Save className="size-4" /> Save
              </Button>
            </>
          }
        />
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="min-h-[60vh] resize-y font-mono text-xs leading-relaxed"
        />
      </div>
    );
  }

  // -- file browser view ----------------------------------------------------
  return (
    <div className="space-y-6">
      <PageHeader
        title="File manager"
        description="Browse, edit and manage your server files."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setMkdirOpen(true)}>
              <FolderPlus className="size-4" /> New folder
            </Button>
            <Button variant="outline" size="sm" onClick={handleUpload}>
              <Upload className="size-4" /> Upload
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => refetch()}
              aria-label="Refresh"
            >
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            </Button>
          </>
        }
      />

      {/* Breadcrumb navigation */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {segments.map((crumb, i) => (
          <div key={crumb.path} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground" />}
            <button
              type="button"
              onClick={() => navigate(crumb.path)}
              disabled={crumb.path === path}
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors hover:bg-accent",
                crumb.path === path
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {crumb.label}
            </button>
          </div>
        ))}
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{selected.size} selected</span>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={compressMutation.isPending}
              onClick={() => compressMutation.mutate([...selected])}
            >
              <FileArchive className="size-4" /> Compress
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteTargets([...selected])}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : entries?.length ? (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="size-4 cursor-pointer rounded border-input accent-primary"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Size</TableHead>
                <TableHead className="hidden md:table-cell">Permissions</TableHead>
                <TableHead className="hidden md:table-cell">Modified</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const isDir = !entry.isFile;
                const editable = isEditable(entry);
                const archive = entry.isFile && isArchive(entry.name);
                return (
                  <TableRow
                    key={entry.path}
                    data-state={selected.has(entry.path) ? "selected" : undefined}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${entry.name}`}
                        checked={selected.has(entry.path)}
                        onChange={() => toggleOne(entry.path)}
                        className="size-4 cursor-pointer rounded border-input accent-primary"
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() =>
                          isDir
                            ? navigate(entry.path)
                            : editable
                              ? openFile(entry)
                              : undefined
                        }
                        disabled={!isDir && !editable}
                        className={cn(
                          "flex items-center gap-2 text-left",
                          (isDir || editable) && "hover:text-primary",
                          !isDir && !editable && "cursor-default",
                        )}
                      >
                        {isDir ? (
                          <Folder className="size-4 shrink-0 text-primary" />
                        ) : (
                          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{entry.name}</span>
                      </button>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {isDir ? "—" : formatBytes(entry.size)}
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                      {entry.mode}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {formatRelative(entry.modifiedAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setRenameTarget(entry);
                              setRenameValue(entry.name);
                            }}
                          >
                            <Pencil /> Rename
                          </DropdownMenuItem>
                          {entry.isFile && (
                            <DropdownMenuItem
                              onSelect={() => downloadMutation.mutate(entry.path)}
                            >
                              <Download /> Download
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onSelect={() => compressMutation.mutate([entry.path])}
                          >
                            <FileArchive /> Compress
                          </DropdownMenuItem>
                          {archive && (
                            <DropdownMenuItem
                              onSelect={() => decompressMutation.mutate(entry.path)}
                            >
                              <FolderInput /> Extract
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            destructive
                            onSelect={() => setDeleteTargets([entry.path])}
                          >
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          icon={HardDrive}
          title="This folder is empty"
          description={
            path === "/"
              ? "Upload files or create a folder to get started."
              : "Nothing here yet. Go back or create a new folder."
          }
          action={
            path !== "/" ? (
              <Button variant="outline" size="sm" onClick={() => navigate(parentPath(path))}>
                <ArrowLeft className="size-4" /> Back
              </Button>
            ) : undefined
          }
        />
      )}

      {/* New folder dialog */}
      <Dialog open={mkdirOpen} onOpenChange={setMkdirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>Create a folder in {path}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="folder-name">Name</Label>
            <Input
              id="folder-name"
              autoFocus
              placeholder="my-folder"
              value={mkdirName}
              onChange={(e) => setMkdirName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && mkdirName.trim())
                  mkdirMutation.mutate(mkdirName.trim());
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMkdirOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={mkdirMutation.isPending}
              disabled={!mkdirName.trim()}
              onClick={() => mkdirMutation.mutate(mkdirName.trim())}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>Rename “{renameTarget?.name}”.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-value">New name</Label>
            <Input
              id="rename-value"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameValue.trim() && renameTarget)
                  renameMutation.mutate({
                    from: renameTarget.path,
                    to: joinPath(parentPath(renameTarget.path), renameValue.trim()),
                  });
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={renameMutation.isPending}
              disabled={!renameValue.trim()}
              onClick={() =>
                renameTarget &&
                renameMutation.mutate({
                  from: renameTarget.path,
                  to: joinPath(parentPath(renameTarget.path), renameValue.trim()),
                })
              }
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTargets} onOpenChange={(o) => !o && setDeleteTargets(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete{" "}
              {deleteTargets && deleteTargets.length > 1
                ? `${deleteTargets.length} items`
                : "item"}
              ?
            </DialogTitle>
            <DialogDescription>
              This permanently removes the selected file
              {deleteTargets && deleteTargets.length > 1 ? "s" : ""} and any contents. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTargets(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => deleteTargets && deleteMutation.mutate(deleteTargets)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
