/**
 * Line-based INI (`[Section]` + `Key=Value`) and Java-style `.properties`
 * (`key=value`, no sections). Comment and blank lines are never indexed, so
 * they survive a save untouched.
 *
 * The whole remainder of a line is the value: INI dialects disagree about
 * whether `;` starts an inline comment, and guessing wrong would delete a
 * customer's comment on save.
 */

import {
  detectEol,
  duplicateIssues,
  entryId,
  type ConfigDoc,
  type ConfigEntry,
  type ConfigSection,
} from "./types";

interface IniOptions {
  format: "ini" | "properties";
  sections: boolean;
  comments: string[];
}

function parse(text: string, opts: IniOptions): ConfigDoc {
  const entries: ConfigEntry[] = [];
  const issues: string[] = [];
  const sections: ConfigSection[] = [];

  let section = "";
  let sectionStart = 0;
  /** Offset just past the last non-blank line of the current section. */
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

    const isComment = opts.comments.some((c) => trimmed.startsWith(c));
    if (!trimmed || isComment) {
      pos = nextPos;
      continue;
    }

    // Section headers close the previous section BEFORE they count as content,
    // otherwise new keys would be inserted past the next header.
    if (opts.sections && trimmed.startsWith("[")) {
      const match = /^\[([^\]]*)\]$/.exec(trimmed);
      if (match) {
        closeSection(pos);
        section = match[1].trim();
        sectionStart = pos;
        lastContent = lineAfter;
        pos = nextPos;
        continue;
      }
    }

    lastContent = lineAfter;

    const eq = content.indexOf("=");
    if (eq > 0) {
      const key = content.slice(0, eq).trim();
      if (key) {
        let valueStart = pos + eq + 1;
        while (
          valueStart < contentEnd &&
          (text[valueStart] === " " || text[valueStart] === "\t")
        ) {
          valueStart++;
        }
        let valueEnd = contentEnd;
        while (valueEnd > valueStart && /[ \t]/.test(text[valueEnd - 1])) {
          valueEnd--;
        }
        entries.push({
          id: entryId(section, key),
          key,
          section,
          array: false,
          raw: text.slice(valueStart, valueEnd),
          start: valueStart,
          end: valueEnd,
          line: lineNo,
        });
      }
    }
    pos = nextPos;
  }

  closeSection(text.length);
  issues.push(...duplicateIssues(entries));

  return {
    format: opts.format,
    text,
    entries,
    sections,
    issues,
    eol: detectEol(text),
  };
}

export function parseIni(text: string): ConfigDoc {
  return parse(text, { format: "ini", sections: true, comments: [";", "#"] });
}

export function parseProperties(text: string): ConfigDoc {
  return parse(text, {
    format: "properties",
    sections: false,
    comments: ["#", "!"],
  });
}

export function renderIniAssignment(key: string, raw: string): string {
  return `${key}=${raw}`;
}

export function renderIniSection(name: string): string {
  return `[${name}]`;
}
