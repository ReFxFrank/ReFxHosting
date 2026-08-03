/**
 * Format dispatch for the field-based config editor.
 *
 * `applyEdits` is the only writer: it splices the encoded text of the values
 * the customer actually changed into the original file. Every other byte —
 * comments, ordering, unknown keys, line endings, the trailing-newline
 * convention — comes through untouched.
 */

import { parseCfg, renderCfgAssignment } from "./cfg";
import { parseIni, parseProperties, renderIniAssignment, renderIniSection } from "./ini";
import { parseToml, renderTomlAssignment, renderTomlSection } from "./toml";
import {
  entryId,
  type ConfigDoc,
  type ConfigEdit,
  type ConfigEntry,
  type ConfigParserFormat,
} from "./types";

export type {
  ConfigDoc,
  ConfigEdit,
  ConfigEntry,
  ConfigParserFormat,
} from "./types";

const PARSEABLE: ConfigParserFormat[] = ["cfg", "ini", "properties", "toml"];

/** Whether a catalog file format has a structured editor at all. */
export function isParseableFormat(
  format: string,
): format is ConfigParserFormat {
  return (PARSEABLE as string[]).includes(format);
}

export function parseConfig(
  format: ConfigParserFormat,
  text: string,
): ConfigDoc {
  switch (format) {
    case "cfg":
      return parseCfg(text);
    case "ini":
      return parseIni(text);
    case "properties":
      return parseProperties(text);
    case "toml":
      return parseToml(text);
  }
}

/** Exact key match first, then case-insensitive (files vary in casing). */
export function findEntry(
  doc: ConfigDoc,
  key: string,
  section = "",
): ConfigEntry | undefined {
  const id = entryId(section, key);
  const exact = doc.entries.find((e) => e.id === id);
  if (exact) return exact;
  const lower = id.toLowerCase();
  return doc.entries.find((e) => e.id.toLowerCase() === lower);
}

function renderAssignment(
  format: ConfigParserFormat,
  key: string,
  raw: string,
  array: boolean,
): string {
  switch (format) {
    case "cfg":
      return renderCfgAssignment(key, raw, array);
    case "ini":
    case "properties":
      return renderIniAssignment(key, raw);
    case "toml":
      return renderTomlAssignment(key, raw);
  }
}

function renderSection(format: ConfigParserFormat, name: string): string | null {
  switch (format) {
    case "ini":
      return renderIniSection(name);
    case "toml":
      return renderTomlSection(name);
    default:
      return null;
  }
}

/** Where a key for `section` goes, plus a header when the section is missing. */
function insertionPoint(
  doc: ConfigDoc,
  section: string,
): { at: number; header: string | null } {
  const lower = section.toLowerCase();
  const found =
    doc.sections.find((s) => s.name === section) ??
    doc.sections.find((s) => s.name.toLowerCase() === lower);
  if (found) return { at: found.insertAt, header: null };
  return { at: doc.text.length, header: renderSection(doc.format, section) };
}

/**
 * Splice the given value changes into the document. Edits whose key is absent
 * append a new assignment (creating the section header when needed).
 */
export function applyEdits(doc: ConfigDoc, edits: ConfigEdit[]): string {
  if (edits.length === 0) return doc.text;

  const splices: {
    start: number;
    end: number;
    text: string;
    append?: boolean;
  }[] = [];
  /** Pending additions, grouped per section so each header is written once. */
  const additions = new Map<
    string,
    { at: number; headed: boolean; lines: string[] }
  >();

  for (const edit of edits) {
    const section = edit.section ?? "";
    const entry = findEntry(doc, edit.key, section);
    if (entry) {
      splices.push({ start: entry.start, end: entry.end, text: edit.raw });
      continue;
    }
    const { at, header } = insertionPoint(doc, section);
    let group = additions.get(section);
    if (!group) {
      group = { at, headed: !!header, lines: [] };
      if (header) group.lines.push(header);
      additions.set(section, group);
    }
    group.lines.push(
      renderAssignment(doc.format, edit.key, edit.raw, edit.array ?? false),
    );
  }

  // Several sections can land on the same offset (an existing trailing section
  // whose end IS the end of the file, plus brand-new sections appended there).
  // Keys joining a section that already exists must be written before any new
  // header, or that header would capture them. The sort is stable, so edit
  // order within each class — and each header's own keys — stay put.
  const byOffset = new Map<number, string[]>();
  const ordered = [...additions.values()].sort(
    (a, b) => Number(a.headed) - Number(b.headed),
  );
  for (const group of ordered) {
    byOffset.set(group.at, [...(byOffset.get(group.at) ?? []), ...group.lines]);
  }

  for (const [at, lines] of byOffset) {
    const before = doc.text.slice(0, at);
    const needsLeadingBreak = before.length > 0 && !before.endsWith("\n");
    // Appending to a file that doesn't end in a newline must not silently add
    // one, so the last line only gets a terminator if the file already had one.
    const trailing = at === doc.text.length && needsLeadingBreak ? "" : doc.eol;
    const text =
      (needsLeadingBreak ? doc.eol : "") + lines.join(doc.eol) + trailing;
    splices.push({ start: at, end: at, text, append: true });
  }

  // Descending by offset; at the same offset the appended block goes in first,
  // so a replacement landing on that exact offset (an empty value on the last
  // line of a file with no trailing newline) stays in front of it.
  splices.sort(
    (a, b) => b.start - a.start || Number(!!b.append) - Number(!!a.append),
  );
  let out = doc.text;
  for (const splice of splices) {
    out = out.slice(0, splice.start) + splice.text + out.slice(splice.end);
  }
  return out;
}
