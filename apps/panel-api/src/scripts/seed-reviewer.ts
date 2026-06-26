import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ServersService } from '../servers/servers.service';

/**
 * Seed a reviewer / test account WITH a real, provisioned sample server — e.g.
 * the demo login an App Store reviewer uses. Idempotent: re-running reuses an
 * existing reviewer + their server instead of duplicating.
 *
 * Run inside the stack (after `update-panel.sh` rebuilds the image):
 *   infra/scripts/dc run --rm panel-api node dist/scripts/seed-reviewer.js
 *
 * Config (all optional) via env:
 *   REVIEWER_EMAIL          default reviewer@<your domain or refx.gg>
 *   REVIEWER_PASSWORD       default: a strong one is generated + printed
 *   REVIEWER_SERVER_NAME    default "Reviewer Demo"
 *   REVIEWER_TEMPLATE_SLUG  default "minecraft"
 *   REVIEWER_NODE_ID        default: first ONLINE node (else any node)
 */
async function main(): Promise<void> {
  const log = new Logger('seed-reviewer');
  // Build the DI graph but DO NOT init()/listen(): we only call services
  // directly. Skipping the lifecycle bootstrap means (a) GraphQL/Apollo + the WS
  // gateway never try to attach to an HTTP server that doesn't exist here, and
  // (b) this process never starts the BullMQ workers — it stays a pure queue
  // PRODUCER, so the running panel-api worker performs the actual provisioning.
  // Prisma (driver adapter) connects lazily on first query, so no init() needed.
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    abortOnError: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const auth = app.get(AuthService);
    const servers = app.get(ServersService);

    const email = (process.env.REVIEWER_EMAIL ?? 'reviewer@refx.gg')
      .trim()
      .toLowerCase();
    const password = process.env.REVIEWER_PASSWORD?.trim() || undefined;
    const serverName = process.env.REVIEWER_SERVER_NAME ?? 'Reviewer Demo';
    const templateSlug = (process.env.REVIEWER_TEMPLATE_SLUG ?? 'minecraft')
      .trim()
      .toLowerCase();

    // 1) Reviewer user (idempotent). adminCreateUser makes it ACTIVE + verified
    //    so it can sign in immediately. The script acts as a synthetic OWNER so
    //    the privilege ceiling is satisfied for a CUSTOMER target.
    let user = await prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, email: true },
    });
    let issuedPassword: string | null = null;
    if (user) {
      log.log(`reviewer user already exists: ${email} (password unchanged)`);
    } else {
      const res = await auth.adminCreateUser(
        { id: 'seed-script', globalRole: 'OWNER' },
        { email, password, firstName: 'App', lastName: 'Reviewer' },
      );
      user = { id: res.id, email: res.email };
      issuedPassword = res.password;
      log.log(`created reviewer user: ${email}`);
    }

    // 2) Pick a node: explicit id, else first ONLINE, else any non-deleted.
    const explicitNodeId = process.env.REVIEWER_NODE_ID?.trim();
    const node = explicitNodeId
      ? await prisma.node.findFirst({
          where: { id: explicitNodeId, deletedAt: null },
          select: { id: true, name: true },
        })
      : ((await prisma.node.findFirst({
          where: { deletedAt: null, state: 'ONLINE' },
          select: { id: true, name: true },
        })) ??
        (await prisma.node.findFirst({
          where: { deletedAt: null },
          select: { id: true, name: true },
        })));
    if (!node) {
      throw new Error(
        'No node available — register a node (Admin → Nodes) or set REVIEWER_NODE_ID.',
      );
    }

    // 3) Find the Minecraft template (slug match, else any minecraft egg).
    const template =
      (await prisma.gameTemplate.findFirst({
        where: { slug: templateSlug },
        select: { id: true, name: true },
      })) ??
      (await prisma.gameTemplate.findFirst({
        where: { slug: { contains: 'minecraft' } },
        select: { id: true, name: true },
        orderBy: { slug: 'asc' },
      }));
    if (!template) {
      throw new Error(
        `No template matching "${templateSlug}" — check seeded templates (database/seed/templates).`,
      );
    }

    // 4) Sample server (idempotent: reuse any non-deleted server the reviewer owns).
    const existing = await prisma.server.findFirst({
      where: { ownerId: user.id, deletedAt: null },
      select: { id: true, name: true, state: true },
    });
    let serverId: string;
    if (existing) {
      serverId = existing.id;
      log.log(
        `reviewer already owns a server: "${existing.name}" (${existing.state}) — skipping create`,
      );
    } else {
      const created = await servers.adminCreate({
        name: serverName,
        ownerId: user.id,
        nodeId: node.id,
        templateId: template.id,
      });
      serverId = created.id;
      log.log(
        `provisioning ${template.name} server "${serverName}" on node ${node.name}…`,
      );
    }

    // 5) Best-effort: wait for provisioning to leave INSTALLING (the panel worker
    //    does the actual install via the queue). Times out gracefully.
    const deadline = Date.now() + 4 * 60 * 1000;
    let state = '';
    // eslint-disable-next-line no-constant-condition
    while (Date.now() < deadline) {
      const s = await prisma.server.findUnique({
        where: { id: serverId },
        select: { state: true },
      });
      state = s?.state ?? '';
      if (state && state !== 'INSTALLING') break;
      await new Promise((r) => setTimeout(r, 3000));
    }

    log.log('--------------------------------------------------');
    log.log('Reviewer account ready');
    log.log(`  email:    ${email}`);
    log.log(
      `  password: ${issuedPassword ?? '(unchanged — pass REVIEWER_PASSWORD to set on first run)'}`,
    );
    log.log(`  server:   "${serverName}" on node ${node.name}`);
    log.log(`  state:    ${state || 'INSTALLING'}`);
    if (!state || state === 'INSTALLING') {
      log.log(
        '  note: still installing — the running panel worker will finish it shortly.',
      );
    }
    log.log('--------------------------------------------------');
  } finally {
    // Best-effort teardown (we deliberately never init()'d the app).
    await app.close().catch(() => undefined);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[seed-reviewer] failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
