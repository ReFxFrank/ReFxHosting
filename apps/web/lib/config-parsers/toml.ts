/**
 * Flat TOML: `[table]` headers plus `Key = value` lines — enough for the
 * server configs in the catalog (BeamMP, Schedule I). Constructs the editor
 * can't reason about safely (array-of-tables, multi-line strings/arrays) mark
 * the document as unsupported so the caller stays on the raw editor rather
 * than risking a lossy save.
 */

import {
  detectEol,
  duplicateIssues,
  entryId,
  type ConfigDoc,
  type ConfigEntry,
  type ConfigSection,
} from "./types";

/** Offset where an unquoted `#` comment starts, or -1. */
function commentStart(line: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\" && quote === '"') {
        i++;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "#") return i;
  }
  return -1;
}

/** Unbalanced `[`/`{` outside quotes — i.e. a value continuing on the next line. */
function isUnterminated(value: string): boolean {
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === "\\" && quote === '"') {
        i++;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") depth--;
  }
  return depth > 0 || quote !== null;
}

export function parseToml(text: string): ConfigDoc {
  const entries: ConfigEntry[] = [];
  const issues: string[] = [];
  const sections: ConfigSection[] = [];

  let section = "";
  let sectionStart = 0;
  let lastContent = 0;

  const closeSection = (upTo: number) => {
    sections.push({
      name: section,
      insertAt: lastContent > sectionStart ? lastContent : upTo,
    });
  };

  let pos = 0;
  let lineNo = 0;
  while (pos <= text.length) {
    lineNo++;
    const nl = text.indexOf("\n", pos);
    const lineEnd = nl === -1 ? text.length : nl;
    const nextPos = nl === -1 ? text.length + 1 : nl + 1;
    const lineAfter = nl === -1 ? text.length : nl + 1;
    let contentEnd = lineEnd;
    if (contentEnd > pos && text[contentEnd - 1] === "\r") contentEnd--;
    const content = text.slice(pos, contentEnd);
    const trimmed = content.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      pos = nextPos;
      continue;
    }

    if (trimmed.startsWith("[[")) {
      issues.push("arrays of tables ([[…]]) aren't supported by the form");
      pos = nextPos;
      continue;
    }

    // Close the previous table BEFORE this header counts as content, so its
    // new keys are inserted above the header rather than below it.
    if (trimmed.startsWith("[")) {
      // A trailing `# comment` on the header is legal TOML; the header line is
      // never rewritten, so ignoring it for naming purposes is lossless.
      const match = /^\[([^\]]*)\]\s*(?:#.*)?$/.exec(trimmed);
      if (match) {
        closeSection(pos);
        section = match[1].trim();
        sectionStart = pos;
        lastContent = lineAfter;
        pos = nextPos;
        continue;
      }
      issues.push(
        `the table header on line ${lineNo} isn't one the form can read safely`,
      );
      pos = nextPos;
      continue;
    }

    lastContent = lineAfter;

    const eq = content.indexOf("=");
    if (eq > 0) {
      const key = content.slice(0, eq).trim().replace(/^"(.*)"$/, "$1");
      if (key) {
        let valueStart = pos + eq + 1;
        while (
          valueStart < contentEnd &&
          (text[valueStart] === " " || text[valueStart] === "\t")
        ) {
          valueStart++;
        }
        const rest = text.slice(valueStart, contentEnd);
        const comment = commentStart(rest);
        let valueEnd = comment === -1 ? contentEnd : valueStart + comment;
        while (valueEnd > valueStart && /[ \t]/.test(text[valueEnd - 1])) {
          valueEnd--;
        }
        const raw = text.slice(valueStart, valueEnd);
        if (isUnterminated(raw)) {
          issues.push(
            `"${key}" spans multiple lines — the form can't edit it safely`,
          );
        } else {
          entries.push({
            id: entryId(section, key),
            key,
            section,
            array: false,
            raw,
            start: valueStart,
            end: valueEnd,
            line: lineNo,
          });
        }
      }
    }
    pos = nextPos;
  }

  closeSection(text.length);
  issues.push(...duplicateIssues(entries));

  return {
    format: "toml",
    text,
    entries,
    sections,
    issues,
    eol: detectEol(text),
  };
}

export function renderTomlAssignment(key: string, raw: string): string {
  return `${key} = ${raw}`;
}

export function renderTomlSection(name: string): string {
  return `[${name}]`;
}
