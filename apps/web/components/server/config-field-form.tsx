"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Lock, Plus, TriangleAlert, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fieldOptions } from "@/lib/config-parsers/values";
import { groupRows, type ConfigRow } from "@/lib/config-form";

/**
 * Typed form over one config file. Every row edits a single value in place —
 * the raw editor and this view write the same string through the same save,
 * so switching between them never loses work.
 */
export function ConfigFieldForm({
  serverId,
  rows,
  canWrite,
  onChange,
  onAdd,
  onRevert,
}: {
  serverId: string;
  rows: ConfigRow[];
  canWrite: boolean;
  onChange: (id: string, draft: string) => void;
  onAdd: (row: ConfigRow) => void;
  onRevert: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const needle = filter.trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (needle) {
      const haystack =
        `${row.field.label} ${row.field.key} ${row.field.description ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    // Advanced rows stay hidden unless asked for — or already customised, so
    // nobody loses sight of a value they set.
    if (row.field.advanced && !showAdvanced && !needle) {
      return row.present || row.changed;
    }
    return true;
  });

  const groups = groupRows(visible);
  const advancedHidden = rows.filter(
    (row) => row.field.advanced && !visible.includes(row),
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter settings…"
          className="h-9 max-w-xs"
          aria-label="Filter settings"
        />
        {advancedHidden > 0 && !needle && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(true)}
          >
            Show {advancedHidden} advanced
          </Button>
        )}
        {showAdvanced && !needle && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(false)}
          >
            Hide advanced
          </Button>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-muted-foreground">
          No settings match “{filter}”.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.name} className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.name}
            </h3>
            <div className="divide-y divide-white/5 rounded-lg border border-white/10 bg-white/[0.02]">
              {group.rows.map((row) => (
                <FieldRow
                  key={row.id}
                  serverId={serverId}
                  row={row}
                  canWrite={canWrite}
                  onChange={onChange}
                  onAdd={onAdd}
                  onRevert={onRevert}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function FieldRow({
  serverId,
  row,
  canWrite,
  onChange,
  onAdd,
  onRevert,
}: {
  serverId: string;
  row: ConfigRow;
  canWrite: boolean;
  onChange: (id: string, draft: string) => void;
  onAdd: (row: ConfigRow) => void;
  onRevert: (id: string) => void;
}) {
  const { field } = row;
  const managed = !!field.managedByPanel;
  const disabled = !canWrite || managed;

  return (
    <div className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] sm:items-start sm:gap-4">
      <div className="space-y-0.5">
        <Label
          htmlFor={`cfg-${row.id}`}
          className="flex flex-wrap items-center gap-2 text-sm font-medium"
        >
          {field.label}
          {row.changed && (
            <span className="size-1.5 rounded-full bg-primary" aria-label="changed" />
          )}
          {managed && (
            <span className="inline-flex items-center gap-1 rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
              <Lock className="size-2.5" /> panel-managed
            </span>
          )}
        </Label>
        {field.description && (
          <p className="text-xs text-muted-foreground">{field.description}</p>
        )}
        <p className="font-mono text-[10px] text-muted-foreground/70">
          {field.key}
          {field.type === "string[]" ? "[]" : ""}
        </p>
        {managed && (
          <p className="text-xs text-muted-foreground">
            Set from the Startup tab — edits here are overwritten on the next
            boot.{" "}
            <Link
              href={`/servers/${serverId}/settings`}
              className="text-primary underline-offset-2 hover:underline"
            >
              Open Settings → Startup
            </Link>
          </p>
        )}
        {!row.recognised && row.present && (
          <p className="flex items-center gap-1.5 text-xs text-warning">
            <TriangleAlert className="size-3" />
            The file&apos;s value doesn&apos;t look like a {field.type} — edit it
            as text or use the raw editor.
          </p>
        )}
      </div>

      <div className="space-y-1">
        {row.draft === null ? (
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <span className="text-xs text-muted-foreground">
              Not set — game default
              {field.default ? `: ${field.default}` : ""}
            </span>
            {!disabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAdd(row)}
              >
                <Plus className="size-3.5" /> Add
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <FieldWidget
                row={row}
                disabled={disabled}
                onChange={(value) => onChange(row.id, value)}
              />
            </div>
            {row.changed && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Revert ${field.label}`}
                onClick={() => onRevert(row.id)}
              >
                <Undo2 className="size-3.5" />
              </Button>
            )}
          </div>
        )}
        {row.error && <p className="text-xs text-destructive">{row.error}</p>}
      </div>
    </div>
  );
}

function FieldWidget({
  row,
  disabled,
  onChange,
}: {
  row: ConfigRow;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const { field } = row;
  const value = row.draft ?? "";
  const id = `cfg-${row.id}`;

  // A value the file already holds but the field can't interpret stays plain
  // text, so an odd-but-deliberate setting is never coerced into a widget.
  const asText = !row.recognised && field.type !== "string" && field.type !== "password";

  if (!asText && field.type === "bool") {
    return (
      <div className="flex h-9 items-center sm:justify-end">
        <Switch
          id={id}
          checked={value === "true"}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
        />
      </div>
    );
  }

  if (!asText && field.type === "enum") {
    const options = fieldOptions(field);
    const known = options.some((o) => o.value === value);
    return (
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => onChange(next)}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {!known && value !== "" && (
            <SelectItem value={value}>{value} (current)</SelectItem>
          )}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (!asText && field.type === "string[]") {
    return (
      <Textarea
        id={id}
        value={value}
        disabled={disabled}
        rows={Math.min(6, Math.max(2, value.split("\n").length + 1))}
        spellCheck={false}
        placeholder="One per line"
        className="font-mono text-xs"
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (field.type === "password") {
    return (
      <div className="flex items-center gap-1">
        <Input
          id={id}
          type={revealed ? "text" : "password"}
          value={value}
          disabled={disabled}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={revealed ? "Hide value" : "Show value"}
          onClick={() => setRevealed((v) => !v)}
        >
          {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </Button>
      </div>
    );
  }

  const numeric = !asText && (field.type === "int" || field.type === "float");
  return (
    <Input
      id={id}
      value={value}
      disabled={disabled}
      inputMode={numeric ? "decimal" : undefined}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
