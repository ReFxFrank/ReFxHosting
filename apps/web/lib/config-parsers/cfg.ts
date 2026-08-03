/**
 * Arma-style `.cfg` (server.cfg / basic.cfg): `key = value;` with quoted
 * strings, `key[] = {a, b};` arrays and `class X { ... };` blocks.
 *
 * Only assignments at the top level are indexed — anything inside a class
 * block (mission rotations, difficulty presets) is passed through untouched,
 * because those are structures the form has no business rewriting.
 */

import {
  detectEol,
  duplicateIssues,
  lineAt,
  type ConfigDoc,
  type ConfigEntry,
} from "./types";

const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdentChar = (c: string) => /[A-Za-z0-9_]/.test(c);

/** Past a `"…"` literal; Arma escapes an inner quote by doubling it. */
function skipString(text: string, i: number): number {
  i++; // opening quote
  while (i < text.length) {
    if (text[i] === '"') {
      if (text[i + 1] === '"') {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return -1; // unterminated
}

function endOfLine(text: string, i: number): number {
  const nl = text.indexOf("\n", i);
  return nl === -1 ? text.length : nl + 1;
}

function skipBlockComment(text: string, i: number): number {
  const end = text.indexOf("*/", i + 2);
  return end === -1 ? -1 : end + 2;
}

/** True when only whitespace separates `i` from the start of its line. */
function atLineStart(text: string, i: number): boolean {
  for (let j = i - 1; j >= 0; j--) {
    const c = text[j];
    if (c === "\n") return true;
    if (c !== " " && c !== "\t" && c !== "\r") return false;
  }
  return true;
}

function skipTrivia(text: string, i: number): number {
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] === "/" && text[i + 1] === "/") {
      i = endOfLine(text, i);
      continue;
    }
    if (text[i] === "/" && text[i + 1] === "*") {
      const next = skipBlockComment(text, i);
      if (next === -1) return text.length;
      i = next;
      continue;
    }
    return i;
  }
}

/**
 * Offset of the `;` closing a value (-1 at EOF), plus whether the value ran
 * past a line break outside `{}`. A value that crosses a newline means the
 * previous line simply lost its `;` — indexing it would swallow the following
 * assignments and a save would delete them.
 */
function findValueEnd(
  text: string,
  start: number,
): { semi: number; multiline: boolean } {
  let i = start;
  let depth = 0;
  let multiline = false;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const next = skipString(text, i);
      if (next === -1) return { semi: -1, multiline };
      i = next;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      // A line comment eats the rest of the line, so any `;` is on a later one.
      if (depth <= 0) multiline = true;
      i = endOfLine(text, i);
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const next = skipBlockComment(text, i);
      if (next === -1) return { semi: -1, multiline };
      if (depth <= 0 && text.slice(i, next).includes("\n")) multiline = true;
      i = next;
      continue;
    }
    if (c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === "}") {
      depth--;
      i++;
      continue;
    }
    if (c === "\n" && depth <= 0) multiline = true;
    if (c === ";" && depth <= 0) return { semi: i, multiline };
    i++;
  }
  return { semi: -1, multiline };
}

export function parseCfg(text: string): ConfigDoc {
  const entries: ConfigEntry[] = [];
  const issues: string[] = [];
  let depth = 0;
  let i = 0;

  while (i < text.length) {
    const c = text[i];

    if (c === '"') {
      const next = skipString(text, i);
      if (next === -1) {
        issues.push("a quoted string is never closed");
        break;
      }
      i = next;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      i = endOfLine(text, i);
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const next = skipBlockComment(text, i);
      if (next === -1) {
        issues.push("a /* block comment */ is never closed");
        break;
      }
      i = next;
      continue;
    }
    // Preprocessor lines (#include, #define) are opaque.
    if (c === "#" && atLineStart(text, i)) {
      i = endOfLine(text, i);
      continue;
    }
    if (c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === "}") {
      depth--;
      if (depth < 0) {
        issues.push("unbalanced { } braces");
        depth = 0;
      }
      i++;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i;
      while (j < text.length && isIdentChar(text[j])) j++;
      const key = text.slice(i, j);
      let k = skipTrivia(text, j);
      let array = false;
      if (text[k] === "[" && text[k + 1] === "]") {
        array = true;
        k = skipTrivia(text, k + 2);
      }
      // `class Missions {` and other bare identifiers just move the cursor on.
      if (text[k] !== "=" || text[k + 1] === "=") {
        i = j;
        continue;
      }
      const valueStart = skipTrivia(text, k + 1);
      const { semi, multiline } = findValueEnd(text, valueStart);
      if (semi === -1) {
        issues.push(`"${key}" is missing its closing ";"`);
        i = j;
        continue;
      }
      if (multiline) {
        issues.push(
          `"${key}" is missing its closing ";" — its value runs into the following line`,
        );
        i = semi + 1;
        continue;
      }
      if (depth === 0) {
        let end = semi;
        while (end > valueStart && /\s/.test(text[end - 1])) end--;
        entries.push({
          id: key,
          key,
          section: "",
          array,
          raw: text.slice(valueStart, end),
          start: valueStart,
          end,
          line: lineAt(text, valueStart),
        });
      }
      i = semi + 1;
      continue;
    }
    i++;
  }

  if (depth !== 0) issues.push("unbalanced { } braces");
  issues.push(...duplicateIssues(entries));

  return {
    format: "cfg",
    text,
    entries,
    sections: [{ name: "", insertAt: text.length }],
    issues,
    eol: detectEol(text),
  };
}

export function renderCfgAssignment(
  key: string,
  raw: string,
  array: boolean,
): string {
  return `${key}${array ? "[]" : ""} = ${raw};`;
}
