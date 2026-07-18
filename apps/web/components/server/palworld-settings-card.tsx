"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Save, ChevronDown, Lock, Settings2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
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
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { hasServerPermission } from "@/lib/server-permissions";
import { PALWORLD_GROUPS, PALWORLD_FIELDS } from "@/lib/palworld-fields";
import type { PalFieldMeta } from "@/lib/palworld-fields";
import { isPalSecret } from "@/lib/types";
import type { PalworldSettings, PalFieldValue, Server } from "@/lib/types";

type FormValue = string | boolean | string[];

/** Initial form value for a field, from the ini value (or its Palworld default
 * when absent). Secrets are always blank (write-only). */
function initialValue(meta: PalFieldMeta, raw: PalFieldValue | undefined): FormValue {
  switch (meta.type) {
    case "secret":
      return "";
    case "bool":
      return typeof raw === "boolean" ? raw : Boolean(meta.default ?? false);
    case "enum":
      return typeof raw === "string" && raw
        ? raw
        : String(meta.default ?? meta.options?.[0] ?? "");
    case "tuple":
      return Array.isArray(raw)
        ? [...raw]
        : [...((meta.default as string[]) ?? [])];
    case "int":
    case "float":
      return typeof raw === "number"
        ? String(raw)
        : meta.default != null
          ? String(meta.default)
          : "";
    case "string":
    default:
      return typeof raw === "string" ? raw : String(meta.default ?? "");
  }
}

function buildForm(data: PalworldSettings): Record<string, FormValue> {
  const out: Record<string, FormValue> = {};
  for (const meta of PALWORLD_FIELDS) {
    out[meta.key] = initialValue(meta, data.fields[meta.key]);
  }
  return out;
}

/**
 * Palworld settings editor: a curated form over PalWorldSettings.ini's
 * OptionSettings tuple. Saves only while the server is stopped (Palworld reads
 * the ini once at boot and clobbers live edits), writing atomically via the
 * agent. Mirrors the world-recovery card's stop-first gating.
 */
export function PalworldSettingsCard({ server }: { server: Server }) {
  const id = server.id;
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, FormValue>>({});
  const [initial, setInitial] = useState<Record<string, FormValue>>({});
  const [seenData, setSeenData] = useState<PalworldSettings | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const canWrite = hasServerPermission(server.viewerPermissions, "settings.update");

  const { data, isLoading, error } = useQuery({
    queryKey: ["palworld-settings", id],
    queryFn: () => api.servers.palworldSettings(id),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // (Re)initialize the form when fresh settings arrive (mount + after a save).
  // Setting state during render is the React-recommended way to reset on an
  // input change; React Query's structural sharing keeps `data` identity stable
  // unless the values actually change, so this only fires on a real change.
  if (data && data !== seenData) {
    setSeenData(data);
    const f = buildForm(data);
    setForm(f);
    setInitial(f);
  }

  const editable = !!data?.editable;

  const setField = (key: string, value: FormValue) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleTuple = (key: string, option: string, options: string[]) =>
    setForm((prev) => {
      const cur = (prev[key] as string[]) ?? [];
      const has = cur.includes(option);
      // Preserve the canonical option order.
      const next = options.filter((o) =>
        o === option ? !has : cur.includes(o),
      );
      return { ...prev, [key]: next };
    });

  /** Only the fields the user actually changed (+ non-empty secrets). */
  const payload = useMemo<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    for (const meta of PALWORLD_FIELDS) {
      if (meta.managed) continue;
      const cur = form[meta.key];
      if (cur === undefined) continue;
      if (meta.type === "secret") {
        if (typeof cur === "string" && cur.trim() !== "") out[meta.key] = cur;
        continue;
      }
      const init = initial[meta.key];
      const changed =
        meta.type === "tuple"
          ? JSON.stringify(cur) !== JSON.stringify(init)
          : cur !== init;
      if (!changed) continue;
      if (meta.type === "int" || meta.type === "float") {
        if (cur === "" || cur == null) continue;
        out[meta.key] = Number(cur);
      } else {
        out[meta.key] = cur;
      }
    }
    return out;
  }, [form, initial]);

  const pendingCount = Object.keys(payload).length;

  const save = useMutation({
    mutationFn: () => api.servers.setPalworldSettings(id, payload),
    onSuccess: () => {
      toast.success("Palworld settings saved. They apply the next time the server starts.");
      queryClient.invalidateQueries({ queryKey: ["palworld-settings", id] });
      queryClient.invalidateQueries({ queryKey: ["server", id] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to save settings"),
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          {error instanceof ApiError
            ? error.message
            : "Couldn’t read PalWorldSettings.ini. Start or reinstall the server once to generate it."}
        </CardContent>
      </Card>
    );
  }

  const saveDisabled =
    !canWrite || !editable || pendingCount === 0 || save.isPending;

  const SaveButton = (
    <Button loading={save.isPending} disabled={saveDisabled} onClick={() => save.mutate()}>
      <Save className="size-4" />
      {pendingCount > 0 ? `Save ${pendingCount} change${pendingCount === 1 ? "" : "s"}` : "Save"}
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* Stop-first banner (mirrors world recovery) */}
      {!editable && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <strong>Stop the server to edit.</strong> Palworld reads
            PalWorldSettings.ini only when it boots and overwrites live edits, so
            settings can only be changed while the server is offline. Your changes
            apply on the next start.
          </span>
        </div>
      )}

      {!canWrite && (
        <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>You have read-only access to this server’s settings.</span>
        </div>
      )}

      {/* Top action row */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {pendingCount > 0
            ? `${pendingCount} unsaved change${pendingCount === 1 ? "" : "s"}.`
            : "All changes saved."}
        </p>
        {SaveButton}
      </div>

      {PALWORLD_GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle className="text-base">{group.title}</CardTitle>
            {group.description && (
              <CardDescription>{group.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {group.fields.map((meta) => (
                <Field
                  key={meta.key}
                  meta={meta}
                  value={form[meta.key]}
                  secretSet={
                    meta.type === "secret" &&
                    isPalSecret(data.fields[meta.key] ?? null) &&
                    (data.fields[meta.key] as { set: boolean }).set
                  }
                  disabled={!editable || !canWrite || !!meta.managed}
                  onChange={(v) => setField(meta.key, v)}
                  onToggleTuple={(opt) =>
                    toggleTuple(meta.key, opt, meta.options ?? [])
                  }
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Advanced: read-only view of every other key round-tripped from the ini */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setShowAdvanced((s) => !s)}>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4" /> Advanced (other keys)
            <Badge variant="secondary">{data.extraKeys.length}</Badge>
            <ChevronDown
              className={`ml-auto size-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            />
          </CardTitle>
          <CardDescription>
            Every other key present in PalWorldSettings.ini. These are preserved
            on save but not editable here — change them in the file manager while
            the server is stopped.
          </CardDescription>
        </CardHeader>
        {showAdvanced && (
          <CardContent>
            {data.extraKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No other keys — every setting in the ini is covered by the form
                above.
              </p>
            ) : (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 font-mono text-xs sm:grid-cols-2">
                {data.extraKeys.map((k) => (
                  <div key={k.key} className="flex gap-2 truncate">
                    <dt className="text-muted-foreground">{k.key}</dt>
                    <dd className="truncate">= {k.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        )}
      </Card>

      {/* Bottom action row */}
      <div className="flex justify-end">{SaveButton}</div>
    </div>
  );
}

function Field({
  meta,
  value,
  secretSet,
  disabled,
  onChange,
  onToggleTuple,
}: {
  meta: PalFieldMeta;
  value: FormValue | undefined;
  secretSet?: boolean;
  disabled: boolean;
  onChange: (v: FormValue) => void;
  onToggleTuple: (option: string) => void;
}) {
  const labelEl = (
    <Label className="flex items-center gap-1.5">
      {meta.label}
      {meta.managed && (
        <Badge variant="outline" className="gap-1 text-[10px] font-normal">
          <Lock className="size-2.5" /> Startup tab
        </Badge>
      )}
    </Label>
  );

  if (meta.type === "bool") {
    return (
      <div className="flex items-center justify-between gap-4 sm:col-span-1">
        {labelEl}
        <Switch
          checked={!!value}
          disabled={disabled}
          onCheckedChange={(v) => onChange(v)}
        />
      </div>
    );
  }

  if (meta.type === "enum") {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <Select
          value={String(value ?? "")}
          disabled={disabled}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(meta.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (meta.type === "tuple") {
    const arr = (value as string[]) ?? [];
    return (
      <div className="space-y-1.5 sm:col-span-2">
        {labelEl}
        <div className="flex flex-wrap gap-2">
          {(meta.options ?? []).map((o) => {
            const on = arr.includes(o);
            return (
              <button
                key={o}
                type="button"
                disabled={disabled}
                onClick={() => onToggleTuple(o)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  on
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-white/10 text-muted-foreground hover:text-foreground"
                }`}
              >
                {o}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (meta.type === "secret") {
    return (
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          {meta.label}
          {meta.managed && (
            <Badge variant="outline" className="gap-1 text-[10px] font-normal">
              <Lock className="size-2.5" /> Startup tab
            </Badge>
          )}
          <Badge variant={secretSet ? "secondary" : "muted"} className="text-[10px] font-normal">
            {secretSet ? "set" : "not set"}
          </Badge>
        </Label>
        <Input
          type="password"
          autoComplete="new-password"
          value={String(value ?? "")}
          disabled={disabled}
          placeholder={
            meta.managed
              ? "Managed on the Startup tab"
              : secretSet
                ? "•••••••• (leave blank to keep)"
                : "Not set"
          }
          onChange={(e) => onChange(e.target.value)}
        />
        {meta.help && !disabled && (
          <p className="text-xs text-muted-foreground">{meta.help}</p>
        )}
      </div>
    );
  }

  // int / float / string
  const isNum = meta.type === "int" || meta.type === "float";
  return (
    <div className="space-y-1.5">
      {labelEl}
      <Input
        type={isNum ? "number" : "text"}
        inputMode={meta.type === "int" ? "numeric" : undefined}
        step={meta.type === "float" ? "any" : meta.type === "int" ? "1" : undefined}
        min={meta.min}
        max={meta.max}
        value={String(value ?? "")}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {meta.help && !disabled && (
        <p className="text-xs text-muted-foreground">{meta.help}</p>
      )}
    </div>
  );
}
