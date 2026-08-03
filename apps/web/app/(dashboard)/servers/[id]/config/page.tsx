"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileCog,
  Save,
  RotateCcw,
  Info,
  Lock,
  ListChecks,
  Code2,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { hasServerPermission } from "@/lib/server-permissions";
import {
  configFilesFor,
  configNoteFor,
  type ConfigFileMeta,
} from "@/lib/config-files";
import {
  applyEdits,
  isParseableFormat,
  parseConfig,
  type ConfigParserFormat,
} from "@/lib/config-parsers";
import { buildConfigRows, rowsToEdits } from "@/lib/config-form";
import { ConfigFieldForm } from "@/components/server/config-field-form";

/** Above this the structured form is skipped — such a file is not hand-authored. */
const MAX_FORM_BYTES = 512_000;

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

const sameDrafts = (
  a: Record<string, string>,
  b: Record<string, string>,
) => {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  );
};

/**
 * Quick config editor: the egg-appropriate config files for this game, editable
 * in place without digging through the file manager. Grounded per egg in
 * lib/config-files.ts; files that don't exist yet get a clear explanation
 * instead of an error. Files that carry typed field metadata get a form view,
 * with the raw editor always one click away.
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
              running={server.state === "RUNNING"}
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
  running,
}: {
  serverId: string;
  file: ConfigFileMeta;
  canWrite: boolean;
  running: boolean;
}) {
  const qc = useQueryClient();
  /** Raw editor's pending text; also the carrier when switching views. */
  const [rawDraft, setRawDraft] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<string[]>([]);
  const [view, setView] = useState<"form" | "raw">("form");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["config-file", serverId, file.path],
    queryFn: () => api.servers.files.read(serverId, file.path),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const save = useMutation({
    mutationFn: (vars: {
      content: string;
      from: string | null;
      drafts: Record<string, string>;
      added: string[];
    }) => api.servers.files.write(serverId, file.path, vars.content),
    onSuccess: (_res, vars) => {
      toast.success(`${file.label} saved — restart the server to apply.`);
      // Only clear state the user hasn't touched since this save started, so
      // in-flight keystrokes aren't silently discarded. The raw carrier is
      // dropped when it still holds the text this save was computed from —
      // leaving it behind would shadow the fresh file and revert the save.
      setRawDraft((d) =>
        d === vars.content || d === vars.from ? null : d,
      );
      setDrafts((d) => (sameDrafts(d, vars.drafts) ? {} : d));
      setAdded((a) => (sameList(a, vars.added) ? [] : a));
      qc.invalidateQueries({ queryKey: ["config-file", serverId, file.path] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save"),
  });

  // A 404 means the file isn't on disk yet; anything else is a real read error
  // (agent offline, permission) and must not be mislabelled as "doesn't exist".
  const notFound =
    !!error && (!(error instanceof ApiError) || error.status === 404);
  const base = rawDraft ?? data ?? "";

  const fields = useMemo(() => file.fields ?? [], [file.fields]);
  const formCapable =
    fields.length > 0 &&
    isParseableFormat(file.format) &&
    base.length <= MAX_FORM_BYTES;

  const doc = useMemo(
    () =>
      formCapable
        ? parseConfig(file.format as ConfigParserFormat, base)
        : null,
    [formCapable, file.format, base],
  );
  const rows = useMemo(
    () => (doc ? buildConfigRows(doc, fields, drafts, added) : []),
    [doc, fields, drafts, added],
  );
  const nextText = useMemo(
    () => (doc ? applyEdits(doc, rowsToEdits(doc, rows)) : base),
    [doc, rows, base],
  );

  const parseIssue = doc?.issues[0];
  const formUsable = !!doc && !parseIssue;
  const invalidRows = rows.filter((r) => r.error).length;
  const dirty = nextText !== (data ?? "");
  const showForm = formUsable && view === "form";

  /**
   * Both views edit the same string: leaving the form folds its pending edits
   * into the raw draft, and returning re-reads the values out of that text —
   * so a switch never loses work. The one case it blocks on is a value that
   * can't be encoded, which by definition can't be carried into the text.
   */
  const toRaw = () => {
    if (invalidRows > 0) {
      toast.error(
        `Fix or revert the ${invalidRows} highlighted setting${invalidRows === 1 ? "" : "s"} first — an invalid value can't be carried into the raw editor.`,
      );
      return;
    }
    if (dirty) setRawDraft(nextText);
    setDrafts({});
    setAdded([]);
    setView("raw");
  };
  const toForm = () => {
    if (!formCapable) return;
    const parsed = parseConfig(file.format as ConfigParserFormat, base);
    if (parsed.issues.length > 0) {
      toast.error(`Can't show a form for this file — ${parsed.issues[0]}.`);
      return;
    }
    setView("form");
  };

  const discard = () => {
    setRawDraft(null);
    setDrafts({});
    setAdded([]);
    refetch();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <FileCog className="size-4" />
          <span className="font-mono text-sm">{file.path}</span>
          <Badge variant="outline" className="text-[10px]">{file.format}</Badge>
          {!canWrite && (
            <Badge variant="muted" className="gap-1 text-[10px] font-normal">
              <Lock className="size-2.5" /> read-only
            </Badge>
          )}
          {formCapable && formUsable && (
            <div className="ml-auto flex items-center gap-1 rounded-md border border-white/10 p-0.5">
              <Button
                type="button"
                size="sm"
                variant={view === "form" ? "outline" : "ghost"}
                onClick={toForm}
              >
                <ListChecks className="size-3.5" /> Form
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === "raw" ? "outline" : "ghost"}
                onClick={toRaw}
              >
                <Code2 className="size-3.5" /> Raw
              </Button>
            </div>
          )}
        </CardTitle>
        <CardDescription>{file.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : error && !notFound ? (
          <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-muted-foreground">
            <p>
              Couldn&apos;t load this file:{" "}
              {error instanceof ApiError ? error.message : "read failed"}. The
              node may be offline.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RotateCcw className="size-4" /> Retry
            </Button>
          </div>
        ) : error && notFound && !canWrite ? (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-muted-foreground">
            This file doesn&apos;t exist yet
            {file.createdBy === "install"
              ? " — reinstall/Update the server to create it"
              : file.createdBy === "first-boot"
                ? " — it's created the first time the server starts"
                : " — this game doesn't create it automatically"}
            .
          </div>
        ) : (
          <>
            {notFound && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
                This file doesn&apos;t exist yet
                {file.createdBy === "install"
                  ? " (a reinstall/Update creates it)"
                  : file.createdBy === "first-boot"
                    ? " (the first server start creates it)"
                    : " — this game doesn't create it automatically"}
                . You can write it here: enter its contents and Save.
              </div>
            )}
            {running && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
                The server is <strong>running</strong>. Most games read these
                files only at boot, and some rewrite them on shutdown — stop the
                server first if your change doesn&apos;t stick.
              </div>
            )}
            {fields.length > 0 && parseIssue && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
                Showing the raw editor: this file can&apos;t be edited as a form
                because {parseIssue}. Fix it here and the form comes back.
              </div>
            )}

            {showForm ? (
              <ConfigFieldForm
                serverId={serverId}
                rows={rows}
                canWrite={canWrite}
                onChange={(id, value) =>
                  setDrafts((d) => ({ ...d, [id]: value }))
                }
                onAdd={(row) => {
                  setAdded((a) => (a.includes(row.id) ? a : [...a, row.id]));
                  setDrafts((d) => ({
                    ...d,
                    [row.id]: row.field.default ?? "",
                  }));
                }}
                onRevert={(id) => {
                  setDrafts((d) => {
                    const next = { ...d };
                    delete next[id];
                    return next;
                  });
                  setAdded((a) => a.filter((x) => x !== id));
                }}
              />
            ) : (
              <textarea
                value={base}
                onChange={(e) => setRawDraft(e.target.value)}
                readOnly={!canWrite}
                spellCheck={false}
                className="h-96 w-full resize-y rounded-md border border-white/10 bg-[rgba(7,13,24,0.7)] p-3 font-mono text-xs text-foreground focus-visible:border-primary/50 focus-visible:outline-none"
              />
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {invalidRows > 0
                  ? `${invalidRows} setting${invalidRows === 1 ? "" : "s"} need${invalidRows === 1 ? "s" : ""} fixing before you can save.`
                  : dirty
                    ? "Unsaved changes."
                    : "Changes apply on the next restart."}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={!dirty} onClick={discard}>
                  <RotateCcw className="size-4" /> Discard
                </Button>
                <Button
                  disabled={
                    !canWrite || !dirty || invalidRows > 0 || save.isPending
                  }
                  loading={save.isPending}
                  onClick={() =>
                    save.mutate({
                      content: nextText,
                      from: rawDraft,
                      drafts,
                      added,
                    })
                  }
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
