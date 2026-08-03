/**
 * Shared token model for the field-based config editor.
 *
 * The editors are deliberately NOT full format parsers: they index the
 * key/value assignments a file contains and remember the exact character range
 * each value occupies. Everything else (comments, blank lines, unknown keys,
 * class blocks, ordering, line endings) is never touched — a save splices new
 * value text into the original string, so a file round-trips byte-for-byte
 * except for the values the customer actually changed.
 */

export type ConfigParserFormat = "cfg" | "ini" | "properties" | "toml";

/** One indexed `key = value` assignment. */
export interface ConfigEntry {
  /** Match identity: `key` at top level, `Section.key` inside a section. */
  id: string;
  /** Key as written, without the Arma `[]` array suffix. */
  key: string;
  /** Owning section ("" at top level). */
  section: string;
  /** Written with the Arma array suffix (`motd[] = {...}`). */
  array: boolean;
  /** Value text exactly as it appears — no terminator, no trailing comment. */
  raw: string;
  /** Character offsets of `raw` within the document text. */
  start: number;
  end: number;
  /** 1-based line the key sits on. */
  line: number;
}

/** Where a new key belonging to a section should be written. */
export interface ConfigSection {
  name: string;
  /** Offset just past the section's last line (start of the next header). */
  insertAt: number;
}

export interface ConfigDoc {
  format: ConfigParserFormat;
  /** The file exactly as read. */
  text: string;
  entries: ConfigEntry[];
  sections: ConfigSection[];
  /** Non-empty when the file couldn't be understood; callers stay on raw. */
  issues: string[];
  /** Dominant line ending, used when appending new lines. */
  eol: "\n" | "\r\n";
}

/** A single value change (or addition) to splice into a document. */
export interface ConfigEdit {
  key: string;
  section?: string;
  /** Format-encoded value text, ready to be written verbatim. */
  raw: string;
  /** Write the Arma `key[] = ...` form when the key has to be added. */
  array?: boolean;
}

export function entryId(section: string, key: string): string {
  return section ? `${section}.${key}` : key;
}

/** Dominant line ending — CRLF only when it is what the file already uses. */
export function detectEol(text: string): "\n" | "\r\n" {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length;
  return crlf > 0 && crlf >= lf - crlf ? "\r\n" : "\n";
}

/** 1-based line number of a character offset. */
export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Flags keys assigned more than once at the same level. Which occurrence wins
 * differs per game, so rather than risk editing the wrong one the caller drops
 * to the raw editor.
 */
export function duplicateIssues(entries: ConfigEntry[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const e of entries) {
    const key = e.id.toLowerCase();
    if (seen.has(key)) dupes.add(e.id);
    seen.add(key);
  }
  return [...dupes].map(
    (id) => `"${id}" is assigned more than once — which one applies is ambiguous`,
  );
}
