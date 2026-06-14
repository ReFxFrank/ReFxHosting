#!/usr/bin/env ts-node
// ============================================================================
// Migration CLI — self-contained importer runner.
// ----------------------------------------------------------------------------
// Instantiates its own PrismaClient (no Nest module registration needed) and
// runs the ImporterService against a chosen MigrationSource.
//
// Usage:
//   ts-node src/migration/cli.ts \
//     --source pterodactyl \
//     --url https://panel.example.com \
//     --key ptla_xxx \
//     [--dry-run] \
//     [--only users,nodes,servers]   (subset of: nodes,templates,users,servers)
//
// Exits non-zero on fatal errors (connection failure, unknown source, etc.).
// `--dry-run` writes nothing; it logs the planned actions and prints the report.
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { ImporterService, ImportOptions } from './importer.service';
import { MigrationSource } from './sources/source.interface';
import { PterodactylSource } from './sources/pterodactyl.source';
import { AmpSource } from './sources/amp.source';
import { TcAdminSource } from './sources/tcadmin.source';
import { MigrationReport } from './types';

interface CliArgs {
  source: string;
  url?: string;
  key?: string;
  dryRun: boolean;
  only: ImportOptions['only'];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    source: '',
    dryRun: false,
    only: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)];
    switch (a) {
      case '--source':
        args.source = next();
        break;
      case '--url':
      case '--api-url':
        args.url = next();
        break;
      case '--key':
      case '--api-key':
        args.key = next();
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--only':
        args.only = next()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean) as ImportOptions['only'];
        break;
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        if (a.startsWith('--')) {
          console.error(`Unknown flag: ${a}`);
          printUsage();
          process.exit(2);
        }
    }
  }
  return args;
}

function printUsage(): void {
  console.log(
    [
      'ReFx Hosting — panel migration importer',
      '',
      'Usage:',
      '  ts-node src/migration/cli.ts --source <pterodactyl|amp|tcadmin> \\',
      '    --url <panel-url> --key <app-key> [--dry-run] [--only nodes,templates,users,servers]',
      '',
      'Flags:',
      '  --source   Source panel kind (required).',
      '  --url      Source panel base URL (Pterodactyl).',
      '  --key      Source Application API key (Pterodactyl: ptla_...).',
      '  --dry-run  Plan only; write nothing.',
      '  --only     Comma list limiting stages: nodes,templates,users,servers.',
    ].join('\n'),
  );
}

function buildSource(args: CliArgs): MigrationSource {
  switch (args.source) {
    case 'pterodactyl': {
      if (!args.url || !args.key) {
        throw new Error('--url and --key are required for --source pterodactyl');
      }
      return new PterodactylSource({ url: args.url, key: args.key });
    }
    case 'amp':
      return new AmpSource();
    case 'tcadmin':
      return new TcAdminSource();
    default:
      throw new Error(
        `Unknown --source "${args.source}" (expected pterodactyl|amp|tcadmin)`,
      );
  }
}

function printReport(report: MigrationReport): void {
  console.log('\n========== Migration Report ==========');
  console.log(`source:   ${report.source}`);
  console.log(`dry-run:  ${report.dryRun}`);
  console.log(`started:  ${report.startedAt}`);
  console.log(`finished: ${report.finishedAt ?? '(incomplete)'}`);
  console.log('\nCounts (created / updated / skipped):');
  for (const [kind, c] of Object.entries(report.counts)) {
    console.log(
      `  ${kind.padEnd(16)} ${c.created} / ${c.updated} / ${c.skipped}`,
    );
  }
  if (report.warnings.length) {
    console.log(`\nWarnings (${report.warnings.length}):`);
    for (const w of report.warnings) {
      console.log(`  - [${w.kind}${w.externalId ? `#${w.externalId}` : ''}] ${w.message}`);
    }
  }
  if (report.errors.length) {
    console.log(`\nErrors (${report.errors.length}):`);
    for (const e of report.errors) {
      console.log(`  - [${e.kind}${e.externalId ? `#${e.externalId}` : ''}] ${e.message}`);
    }
  }
  console.log('======================================\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source) {
    printUsage();
    process.exit(2);
  }

  const source = buildSource(args);
  const prisma = new PrismaClient();

  let report: MigrationReport | undefined;
  try {
    await prisma.$connect();
    const importer = new ImporterService(prisma, source, {
      dryRun: args.dryRun,
      only: args.only,
    });
    report = await importer.run();
  } finally {
    await prisma.$disconnect();
  }

  if (report) {
    printReport(report);
    // Non-zero exit if any per-entity error was recorded.
    if (report.errors.length > 0) process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFATAL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
