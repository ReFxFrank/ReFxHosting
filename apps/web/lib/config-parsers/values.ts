/**
 * Value codec between a form widget's text draft and the literal a config file
 * expects. Encoding is per format (Arma quotes strings and writes booleans as
 * 1/0; TOML wants true/false; INI takes bare text), and every write is
 * validated against the field's type and bounds first — nothing is sanitised
 * on read, so a value the form doesn't recognise is shown exactly as it is.
 */

import type { ConfigFieldMeta } from "../config-files";
import type { ConfigParserFormat } from "./types";

export interface DecodedValue {
  /** Text the widget edits (booleans as "true"/"false", arrays one per line). */
  draft: string;
  /** False when the file's value doesn't fit the field's declared type. */
  recognised: boolean;
}

export type EncodeResult = { raw: string } | { error: string };

export function fieldOptions(
  field: ConfigFieldMeta,
): { value: string; label: string }[] {
  return (field.options ?? []).map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
}

/** True when every enum option is a number, i.e. the literal stays unquoted. */
function numericEnum(field: ConfigFieldMeta): boolean {
  const opts = fieldOptions(field);
  return (
    opts.length > 0 && opts.every((o) => /^[+-]?\d+(\.\d+)?$/.test(o.value))
  );
}

/**
 * Java `.properties` escapes. `Properties.store()` — which is what Minecraft
 * writes server.properties with — emits `\:`, `\=`, `\#`, `\!` and `\\` inside
 * values, so `level-type=minecraft\:normal` has to decode back to
 * `minecraft:normal` before it is matched against a field's options.
 */
function unescapeProperties(raw: string): string {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|[\s\S])/g, (_m, c: string) => {
    switch (c[0]) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      case "f":
        return "\f";
      case "u":
        return String.fromCharCode(parseInt(c.slice(1), 16));
      default:
        return c;
    }
  });
}

function escapeProperties(value: string): string {
  return value.replace(/[\\:=#!]/g, (c) => `\\${c}`);
}

function unquote(format: ConfigParserFormat, raw: string): string {
  if (format === "cfg") {
    if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
      return raw.slice(1, -1).replace(/""/g, '"');
    }
    return raw;
  }
  if (format === "toml") {
    if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
      return raw.slice(1, -1);
    }
    if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
      return raw
        .slice(1, -1)
        .replace(/\\(["\\/bfnrt])/g, (_m, c: string) => {
          switch (c) {
            case "n":
              return "\n";
            case "t":
              return "\t";
            case "r":
              return "\r";
            case "b":
              return "\b";
            case "f":
              return "\f";
            default:
              return c;
          }
        });
    }
    return raw;
  }
  if (format === "properties") return unescapeProperties(raw);
  return raw;
}

function quote(format: ConfigParserFormat, value: string): string {
  if (format === "cfg") return `"${value.replace(/"/g, '""')}"`;
  if (format === "toml") {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  if (format === "properties") return escapeProperties(value);
  return value;
}

/** Items of `{"a", "b"}` (Arma) or `["a", "b"]` (TOML), quotes stripped. */
function splitArray(format: ConfigParserFormat, raw: string): string[] | null {
  const open = format === "cfg" ? "{" : "[";
  const close = format === "cfg" ? "}" : "]";
  const trimmed = raw.trim();
  if (!trimmed.startsWith(open) || !trimmed.endsWith(close)) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  const items: string[] = [];
  let current = "";
  let quoteChar: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quoteChar) {
      if (format === "cfg" && c === '"' && inner[i + 1] === '"') {
        current += '""';
        i++;
        continue;
      }
      if (format === "toml" && c === "\\") {
        current += c + (inner[i + 1] ?? "");
        i++;
        continue;
      }
      if (c === quoteChar) quoteChar = null;
      current += c;
      continue;
    }
    if (c === '"' || (format === "toml" && c === "'")) {
      quoteChar = c;
      current += c;
      continue;
    }
    if (c === ",") {
      items.push(current.trim());
      current = "";
      continue;
    }
    current += c;
  }
  if (current.trim()) items.push(current.trim());
  return items.map((item) => unquote(format, item));
}

export function decodeToDraft(
  format: ConfigParserFormat,
  field: ConfigFieldMeta,
  raw: string,
): DecodedValue {
  const trimmed = raw.trim();
  switch (field.type) {
    case "bool": {
      const value = unquote(format, trimmed).toLowerCase();
      if (["1", "true", "yes", "on"].includes(value)) {
        return { draft: "true", recognised: true };
      }
      if (["0", "false", "no", "off"].includes(value)) {
        return { draft: "false", recognised: true };
      }
      return { draft: trimmed, recognised: false };
    }
    case "int": {
      const value = unquote(format, trimmed);
      return { draft: value, recognised: /^[+-]?\d+$/.test(value) };
    }
    case "float": {
      const value = unquote(format, trimmed);
      return {
        draft: value,
        recognised: value !== "" && Number.isFinite(Number(value)),
      };
    }
    case "enum": {
      const value = unquote(format, trimmed);
      const options = fieldOptions(field);
      // Games are inconsistent about casing ("veteran" vs "Veteran"), so match
      // loosely and show the catalog's spelling.
      const match =
        options.find((o) => o.value === value) ??
        options.find((o) => o.value.toLowerCase() === value.toLowerCase());
      return match
        ? { draft: match.value, recognised: true }
        : { draft: value, recognised: false };
    }
    case "string[]": {
      const items = splitArray(format, trimmed);
      if (!items) return { draft: trimmed, recognised: false };
      return { draft: items.join("\n"), recognised: true };
    }
    default:
      return { draft: unquote(format, trimmed), recognised: true };
  }
}

function checkBounds(field: ConfigFieldMeta, value: number): string | null {
  if (field.min !== undefined && value < field.min) {
    return `Must be ${field.min} or more.`;
  }
  if (field.max !== undefined && value > field.max) {
    return `Must be ${field.max} or less.`;
  }
  return null;
}

export function encodeFromDraft(
  format: ConfigParserFormat,
  field: ConfigFieldMeta,
  draft: string,
): EncodeResult {
  switch (field.type) {
    case "bool": {
      const value = draft.trim().toLowerCase() === "true";
      if (format === "cfg") return { raw: value ? "1" : "0" };
      return { raw: value ? "true" : "false" };
    }
    case "int": {
      const value = draft.trim();
      if (!/^[+-]?\d+$/.test(value)) return { error: "Must be a whole number." };
      const bounds = checkBounds(field, Number(value));
      return bounds ? { error: bounds } : { raw: value };
    }
    case "float": {
      const value = draft.trim();
      if (value === "" || !Number.isFinite(Number(value))) {
        return { error: "Must be a number." };
      }
      const bounds = checkBounds(field, Number(value));
      return bounds ? { error: bounds } : { raw: value };
    }
    case "enum": {
      const value = draft.trim();
      const options = fieldOptions(field);
      if (options.length > 0 && !options.some((o) => o.value === value)) {
        return { error: "Pick one of the listed values." };
      }
      return { raw: numericEnum(field) ? value : quote(format, value) };
    }
    case "string[]": {
      const items = draft
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (items.some((item) => /[\r\n]/.test(item))) {
        return { error: "Items can't contain line breaks." };
      }
      const body = items.map((item) => quote(format, item)).join(", ");
      if (format === "cfg") return { raw: `{${body}}` };
      if (format === "toml") return { raw: `[${body}]` };
      return { raw: items.join(",") };
    }
    default: {
      if (/[\r\n]/.test(draft)) {
        return { error: "This value must stay on one line." };
      }
      return { raw: quote(format, draft) };
    }
  }
}
