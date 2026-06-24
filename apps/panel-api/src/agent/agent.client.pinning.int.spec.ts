import * as https from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, X509Certificate } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Node } from '@prisma/client';
import { NodeAgentClient } from './agent.client';

/**
 * Integration guard for the panel->agent transport against a REAL self-signed
 * HTTPS server bound to 127.0.0.1 (a raw IP) — the exact shape of a production
 * node. This is the test that would have caught both prod incidents:
 *   - undici 6->8 skew breaking every pinned call (global fetch vs npm Agent)
 *   - an IP servername throwing on capture + the pinned dispatcher
 * It exercises NodeAgentClient end to end: TLS cert capture, a pinned request,
 * and that a wrong pin is actually rejected.
 */

const FIX = join(__dirname, '__fixtures__');
const certPem = readFileSync(join(FIX, 'test-agent.cert.pem'));
const keyPem = readFileSync(join(FIX, 'test-agent.key.pem'));
const otherCertPem = readFileSync(join(FIX, 'other-agent.cert.pem'));

const expectedSha256 = createHash('sha256')
  .update(new X509Certificate(certPem).raw)
  .digest('hex');

function makeClient(pinningEnabled: boolean): NodeAgentClient {
  const config = {
    get: (key: string) => {
      switch (key) {
        case 'agent':
          return { requestTimeoutMs: 5000 };
        case 'secretsEncKey':
          return '0'.repeat(64);
        case 'agentTlsPinning':
          return pinningEnabled;
        default:
          return undefined;
      }
    },
  };
  // CryptoService is injected but unused by the paths under test.
  return new NodeAgentClient(config as never, {} as never);
}

function nodeFor(port: number, agentCertPem: string | null): Node {
  return {
    id: '00000000-0000-7000-8000-000000000000',
    fqdn: '127.0.0.1',
    scheme: 'https',
    daemonPort: port,
    agentCertPem,
    agentCertSha256: agentCertPem ? expectedSha256 : null,
  } as unknown as Node;
}

describe('NodeAgentClient TLS pinning (integration, raw-IP host)', () => {
  let server: https.Server;
  let port: number;

  beforeAll(async () => {
    server = https.createServer({ key: keyPem, cert: certPem }, (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, route: req.url }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('captures the agent cert from an IP host without throwing on SNI', async () => {
    // Regression: a raw-IP servername threw "Setting the TLS ServerName to an IP
    // address is not permitted" on capture (the re-pin failure).
    const client = makeClient(false);
    const captured = await client.captureCert(nodeFor(port, null));
    expect(captured.sha256).toBe(expectedSha256);
    expect(captured.pem).toContain('BEGIN CERTIFICATE');
  });

  it('makes a pinned request that succeeds (undici fetch + pinned dispatcher)', async () => {
    // Regression: undici-version skew rejected the dispatcher, so every pinned
    // call threw "unreachable". Here pinning is ON and the pin matches the cert.
    const client = makeClient(true);
    const body = await client.fetchAgentStatus(nodeFor(port, certPem.toString()));
    expect(body).toMatchObject({ ok: true, route: '/healthz' });
  });

  it('rejects a request when the pinned cert does NOT match (pin enforces identity)', async () => {
    const client = makeClient(true);
    await expect(
      client.fetchAgentStatus(nodeFor(port, otherCertPem.toString())),
    ).rejects.toThrow(/unreachable|certificate|self-signed|self signed/i);
  });
});
