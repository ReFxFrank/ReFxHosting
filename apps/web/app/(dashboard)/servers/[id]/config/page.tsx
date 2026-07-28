"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCog, Save, RotateCcw, Info, Lock } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { hasServerPermission } from "@/lib/server-permissions";
import {
  configFilesFor,
  configNoteFor,
  type ConfigFileMeta,
} from "@/lib/config-files";

/**
 * Quick config editor: the egg-appropriate config files for this game, editable
 * in place without digging through the file manager. Grounded per egg in
 * lib/config-files.ts; files that don't exist yet get a clear explanation
 * instead of an error.
 */
export default function ConfigPage() {
  const { id } = useParams<{ id: string }>();

  const { data: server, isLoading } = useQuery({
    queryKey: ["server", id],
    queryFn: () => api.servers.get(id),
  });

  const slug = server?.template?.slug ?? "";
  const files = configFilesFor(slug);
  const note = configNoteFor(slug);
  const canWrite = hasServerPermission(server?.viewerPermissions, "files.write");
  const [selected, setSelected] = useState<string | null>(null);
  const active: ConfigFileMeta | undefined =
    files.find((f) => f.path === selected) ?? files[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Config"
        description="Edit this game's config files directly. Most games read them at boot — restart to apply."
      />

      {isLoading || !server ? (
        <Skeleton className="h-64 w-full" />
      ) : files.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No quick-edit config files are catalogued for this game — use the
            Files tab.
          </CardContent>
        </Card>
      ) : (
        <>
          {note && (
            <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>{note}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setSelected(f.path)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  active?.path === f.path
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-white/10 text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {active && (
            <ConfigFileEditor
              key={active.path}
              serverId={id}
              file={active}
              canWrite={canWrite}
            />
          )}
        </>
      )}
    </div>
  );
}

function ConfigFileEditor({
  serverId,
  file,
  canWrite,
}: {
  serverId: string;
  file: ConfigFileMeta;
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["config-file", serverId, file.path],
    queryFn: () => api.servers.files.read(serverId, file.path),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const save = useMutation({
    mutationFn: (content: string) =>
      api.servers.files.write(serverId, file.path, content),
    onSuccess: () => {
      toast.success(`${file.label} saved — restart the server to apply.`);
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["config-file", serverId, file.path] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save"),
  });

  const content = draft ?? data ?? "";
  const dirty = draft !== null && draft !== (data ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCog className="size-4" />
          <span className="font-mono text-sm">{file.path}</span>
          <Badge variant="outline" className="text-[10px]">{file.format}</Badge>
          {!canWrite && (
            <Badge variant="muted" className="gap-1 text-[10px] font-normal">
              <Lock className="size-2.5" /> read-only
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{file.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : error ? (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-muted-foreground">
            This file doesn&apos;t exist yet
            {file.createdBy === "install"
              ? " — reinstall/Update the server to (re)create it"
              : " — it's created the first time the server starts"}
            . ({error instanceof ApiError ? error.message : "not found"})
          </div>
        ) : (
          <>
            <textarea
              value={content}
              onChange={(e) => setDraft(e.target.value)}
              readOnly={!canWrite}
              spellCheck={false}
              className="h-96 w-full resize-y rounded-md border border-white/10 bg-[rgba(7,13,24,0.7)] p-3 font-mono text-xs text-foreground focus-visible:border-primary/50 focus-visible:outline-none"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {dirty ? "Unsaved changes." : "Changes apply on the next restart."}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  disabled={!dirty}
                  onClick={() => {
                    setDraft(null);
                    refetch();
                  }}
                >
                  <RotateCcw className="size-4" /> Discard
                </Button>
                <Button
                  disabled={!canWrite || !dirty || save.isPending}
                  loading={save.isPending}
                  onClick={() => save.mutate(content)}
                >
                  <Save className="size-4" /> Save
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
