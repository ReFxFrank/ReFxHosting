/**
 * Bridges the config-file catalog's typed fields to the parsed document: what
 * each row currently shows, which rows the customer changed, and the edits a
 * save should splice in. Kept pure so the form component stays presentational.
 */

import type { ConfigFieldMeta } from "./config-files";
import { findEntry, type ConfigDoc, type ConfigEdit } from "./config-parsers";
import { decodeToDraft, encodeFromDraft } from "./config-parsers/values";

export interface ConfigRow {
  /** Row identity — `key`, or `Section.key` for INI/TOML fields. */
  id: string;
  field: ConfigFieldMeta;
  /** The key exists in the file. */
  present: boolean;
  /** Value as the file has it, or null when the key isn't there. */
  original: string | null;
  /** What the widget shows; null means "not set" and nothing is written. */
  draft: string | null;
  /** The customer picked "Add" for a key the file doesn't have yet. */
  added: boolean;
  /** The file's value doesn't fit the field's declared type. */
  recognised: boolean;
  changed: boolean;
  /** Validation failure for the current draft; blocks saving. */
  error?: string;
  /** Encoded literal to write, when the row is changed and valid. */
  raw?: string;
}

export function rowId(field: ConfigFieldMeta): string {
  return field.fileSection ? `${field.fileSection}.${field.key}` : field.key;
}

export function buildConfigRows(
  doc: ConfigDoc,
  fields: ConfigFieldMeta[],
  drafts: Record<string, string>,
  added: string[],
): ConfigRow[] {
  return fields.map((field) => {
    const id = rowId(field);
    const entry = findEntry(doc, field.key, field.fileSection ?? "");
    const decoded = entry ? decodeToDraft(doc.format, field, entry.raw) : null;
    const original = decoded ? decoded.draft : null;
    const isAdded = added.includes(id);
    const fallback = original ?? (isAdded ? (field.default ?? "") : null);
    const draft = drafts[id] ?? fallback;

    // Arma writes list settings as `key[] = {...}`. If the file's shape and the
    // field's type disagree, splicing only the value would produce a scalar
    // under an array key (or vice versa) — refuse rather than corrupt it.
    const shapeMismatch =
      !!entry &&
      doc.format === "cfg" &&
      entry.array !== (field.type === "string[]");

    // Panel-managed keys are rewritten from Startup variables at boot, so the
    // form never writes them even if a draft somehow exists for the row.
    const changed =
      !field.managedByPanel && draft !== null && draft !== original;

    let error: string | undefined;
    let raw: string | undefined;
    if (changed && shapeMismatch) {
      error = `The file writes this key as ${entry.array ? "an array (key[] = {…})" : "a single value"} — edit it in the raw editor.`;
    } else if (changed) {
      const encoded = encodeFromDraft(doc.format, field, draft);
      if ("error" in encoded) error = encoded.error;
      else raw = encoded.raw;
    }

    return {
      id,
      field,
      present: !!entry,
      original,
      draft,
      added: isAdded,
      recognised: (decoded?.recognised ?? true) && !shapeMismatch,
      changed,
      error,
      raw,
    };
  });
}

export function rowsToEdits(doc: ConfigDoc, rows: ConfigRow[]): ConfigEdit[] {
  return rows
    .filter((row) => row.changed && row.raw !== undefined)
    .map((row) => ({
      key: row.field.key,
      section: row.field.fileSection ?? "",
      raw: row.raw as string,
      // Arma writes list keys as `motd[] = {...}`.
      array: doc.format === "cfg" && row.field.type === "string[]",
    }));
}

/** Fields in catalog order, grouped by their `group` heading. */
export function groupRows(
  rows: ConfigRow[],
): { name: string; rows: ConfigRow[] }[] {
  const groups: { name: string; rows: ConfigRow[] }[] = [];
  for (const row of rows) {
    const name = row.field.group ?? "Settings";
    const existing = groups.find((g) => g.name === name);
    if (existing) existing.rows.push(row);
    else groups.push({ name, rows: [row] });
  }
  return groups;
}
