import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Lock-step guard: packages/shared/src/enums.ts MUST mirror every enum in
 * database/prisma/schema.prisma with identical string values (the shared file's
 * own header states this contract; CLAUDE.md mandates it). The mirror is
 * maintained by hand and has drifted before (ServerState missed
 * PENDING_PAYMENT; eleven newer enums were absent entirely) — this spec makes
 * the next drift a test failure instead of a silent gap in web/agent typings.
 *
 * Lives in the panel-api suite (not packages/shared, which has no test runner)
 * because this is the suite that gates every commit and CI run.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const SCHEMA_PATH = resolve(REPO_ROOT, 'database', 'prisma', 'schema.prisma');
const ENUMS_PATH = resolve(REPO_ROOT, 'packages', 'shared', 'src', 'enums.ts');

/** Shared-only enums deliberately absent from the Prisma schema. Add a slug
 * here ONLY for an enum that intentionally has no schema counterpart. */
const SHARED_ONLY: string[] = [];

/** Parse `enum Name { ... }` blocks out of a Prisma schema. Takes the first
 * token per line so a future `VALUE @map("...")` still parses. */
function parsePrismaEnums(schema: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of schema.matchAll(/enum\s+(\w+)\s*\{([^}]*)\}/g)) {
    out[m[1]] = m[2]
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@'))
      .map((l) => l.split(/\s+/)[0]);
  }
  return out;
}

/** Parse `export const Name = { KEY: 'VALUE', ... } as const;` blocks out of
 * enums.ts, taking only value-position strings (after a colon). */
function parseSharedEnums(src: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of src.matchAll(/export const (\w+) = \{([\s\S]*?)\} as const;/g)) {
    out[m[1]] = [...m[2].matchAll(/:\s*'([^']+)'/g)].map((x) => x[1]);
  }
  return out;
}

/** All discrepancies between the two enum maps (empty array == lock-step). */
function diffEnumMaps(
  schema: Record<string, string[]>,
  shared: Record<string, string[]>,
  sharedOnly: string[] = [],
): string[] {
  const problems: string[] = [];
  for (const [name, values] of Object.entries(schema)) {
    const mirror = shared[name];
    if (!mirror) {
      problems.push(`enum ${name} is missing from enums.ts`);
      continue;
    }
    const mirrorSet = new Set(mirror);
    const valueSet = new Set(values);
    for (const v of values.filter((v) => !mirrorSet.has(v))) {
      problems.push(`${name}.${v} is missing from enums.ts`);
    }
    for (const v of mirror.filter((v) => !valueSet.has(v))) {
      problems.push(`${name}.${v} exists in enums.ts but not in schema.prisma`);
    }
  }
  for (const name of Object.keys(shared)) {
    if (!schema[name] && !sharedOnly.includes(name)) {
      problems.push(
        `enum ${name} exists in enums.ts but not in schema.prisma (add it to the schema, remove it, or list it in SHARED_ONLY)`,
      );
    }
  }
  return problems;
}

describe('shared enums lock-step with schema.prisma', () => {
  // Guard the guard: prove the comparator actually detects every drift class,
  // so a parser regression can never make the real check pass vacuously.
  it('the comparator detects missing enums, missing values, and extras', () => {
    const schema = parsePrismaEnums(
      'enum A { ONE\n TWO }\nenum B { X\n Y // trailing comment\n}',
    );
    expect(schema).toEqual({ A: ['ONE', 'TWO'], B: ['X', 'Y'] });

    const shared = parseSharedEnums(
      "export const A = {\n  ONE: 'ONE',\n  /** doc */\n  EXTRA: 'EXTRA',\n} as const;\n" +
        "export const C = { Z: 'Z' } as const;",
    );
    expect(shared).toEqual({ A: ['ONE', 'EXTRA'], C: ['Z'] });

    expect(diffEnumMaps(schema, shared)).toEqual([
      'A.TWO is missing from enums.ts',
      'A.EXTRA exists in enums.ts but not in schema.prisma',
      'enum B is missing from enums.ts',
      'enum C exists in enums.ts but not in schema.prisma (add it to the schema, remove it, or list it in SHARED_ONLY)',
    ]);
    // ...and that SHARED_ONLY exempts a deliberate shared-only enum.
    expect(diffEnumMaps(schema, shared, ['C'])).not.toContain(
      'enum C exists in enums.ts but not in schema.prisma (add it to the schema, remove it, or list it in SHARED_ONLY)',
    );
  });

  it('every schema.prisma enum is mirrored in enums.ts with identical values', () => {
    const schema = parsePrismaEnums(readFileSync(SCHEMA_PATH, 'utf8'));
    const shared = parseSharedEnums(readFileSync(ENUMS_PATH, 'utf8'));

    // Sanity floors: a broken parser must fail loudly, not pass on {}.
    expect(Object.keys(schema).length).toBeGreaterThanOrEqual(30);
    expect(Object.keys(shared).length).toBeGreaterThanOrEqual(30);

    expect(diffEnumMaps(schema, shared, SHARED_ONLY)).toEqual([]);
  });
});
