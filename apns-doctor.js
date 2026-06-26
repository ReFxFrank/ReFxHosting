/* eslint-disable */
'use strict';
/**
 * APNs backend doctor — proves the push backend end-to-end WITHOUT the iOS app.
 *
 * Run inside a container that has the panel-api env (.env via env_file) and `pg`:
 *
 *   docker compose --env-file .env -f infra/docker/docker-compose.yml run --rm \
 *     -v "$PWD/apns-doctor.js:/repo/apns-doctor.js" \
 *     --entrypoint node migrate /repo/apns-doctor.js [send] [user@email]
 *
 * Modes:
 *   (no args)            config + DB rows + AUTH self-test to a throwaway token
 *                        (proves signing; never touches a real device)
 *   send                 ALSO send one real test alert to every stored iOS token
 *   send user@email      ALSO send only to that user's tokens
 *
 * It replicates PushService's loading + signing + request EXACTLY so the result
 * reflects the real backend.
 */
const http2 = require('http2');
const crypto = require('crypto');

function line() { console.log('-'.repeat(68)); }
function ok(b) { return b ? 'OK' : 'MISSING/BAD'; }

// ---- 1) Load config the SAME way configuration.ts does ---------------------
const keyP8 = (
  process.env.APNS_KEY_P8 ??
  (process.env.APNS_KEY_P8_BASE64
    ? Buffer.from(process.env.APNS_KEY_P8_BASE64, 'base64').toString('utf8')
    : '')
).replace(/\\n/g, '\n');
const keyId = process.env.APNS_KEY_ID ?? '';
const teamId = process.env.APNS_TEAM_ID ?? '';
const bundleId = process.env.APNS_BUNDLE_ID ?? '';
const production = (process.env.APNS_PRODUCTION ?? 'false').toLowerCase() === 'true';
const host = production ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';

console.log('\n=== [2] CONFIG (shape only, no secrets) ===');
console.log(`APNS_KEY_P8        : ${ok(keyP8.length > 0)} (len=${keyP8.length}, looksPEM=${keyP8.includes('BEGIN')})`);
console.log(`APNS_KEY_ID        : ${ok(keyId.length === 10)} (len=${keyId.length})`);
console.log(`APNS_TEAM_ID       : ${ok(teamId.length > 0)} (value=${teamId})`);
console.log(`APNS_BUNDLE_ID     : ${ok(bundleId === 'com.refx.app')} (value=${bundleId})`);
console.log(`APNS_PRODUCTION    : ${production} -> host ${host}`);
console.log(`headers that will be sent: apns-topic=${bundleId}, apns-push-type=alert, apns-priority=10`);

// ---- Load the key + sign a JWT (proves the .p8 is a usable EC key) ---------
let signingKey;
let jwt;
try {
  signingKey = crypto.createPrivateKey(keyP8);
  const kt = signingKey.asymmetricKeyType;
  console.log(`key parse          : OK (asymmetricKeyType=${kt})`);
  if (kt !== 'ec') console.log(`  !! WARNING: expected an EC key, got ${kt}`);
  const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header = b64u(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = b64u(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const input = `${header}.${claims}`;
  const sig = crypto.sign('sha256', Buffer.from(input), { key: signingKey, dsaEncoding: 'ieee-p1363' });
  jwt = `${input}.${Buffer.from(sig).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  console.log(`ES256 JWT sign     : OK (jwt length=${jwt.length})`);
} catch (e) {
  console.log(`key parse / sign   : FAILED -> ${e.message}`);
  console.log('\nVERDICT: .p8 key is unusable — fix APNS_KEY_P8 before anything else.');
  process.exit(1);
}

// ---- APNs send helper (one token) ------------------------------------------
function apnsSend(token, payloadObj) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(payloadObj);
    const client = http2.connect(`https://${host}`);
    client.on('error', (e) => resolve({ token, error: `session: ${e.message}` }));
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload),
    });
    let status = 0; let apnsId = ''; const chunks = [];
    req.on('response', (h) => { status = Number(h[':status']) || 0; apnsId = h['apns-id'] || ''; });
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let reason = '';
      if (chunks.length) { try { reason = JSON.parse(Buffer.concat(chunks).toString()).reason || ''; } catch { reason = Buffer.concat(chunks).toString(); } }
      client.close();
      resolve({ token, status, apnsId, reason });
    });
    req.on('error', (e) => { client.close(); resolve({ token, error: e.message }); });
    req.setTimeout(10000, () => { req.close(http2.constants.NGHTTP2_CANCEL); resolve({ token, error: 'timeout' }); });
    req.end(payload);
  });
}

function payloadFor(extra) {
  return { aps: { alert: { title: 'ReFx test', body: 'Backend push doctor test' }, sound: 'default' }, type: 'server.state', serverId: 'doctor-test', ...extra };
}

function interpret(r) {
  if (r.error) return `transport error: ${r.error}`;
  if (r.status === 200) return 'DELIVERED to APNs (backend OK)';
  if (r.status === 400 && /BadDeviceToken/.test(r.reason)) return 'BadDeviceToken — token malformed OR sandbox/prod mismatch (AUTH IS OK)';
  if (r.status === 403 && /(Invalid|Missing)ProviderToken/.test(r.reason)) return 'AUTH BROKEN — bad .p8 / keyId / teamId / clock';
  if (r.status === 410) return 'Unregistered — token no longer valid';
  return `status ${r.status} reason ${r.reason}`;
}

(async () => {
  // ---- AUTH self-test: send to a throwaway token. BadDeviceToken == auth OK.
  console.log('\n=== [5a] AUTH SELF-TEST (throwaway token, no real device) ===');
  const probe = await apnsSend('0'.repeat(64), payloadFor({}));
  console.log(`  status=${probe.status} apns-id=${probe.apnsId} reason=${probe.reason || probe.error || ''}`);
  console.log(`  => ${interpret(probe)}`);

  // ---- 3) DB: PushToken rows --------------------------------------------------
  console.log('\n=== [3] TOKEN STORAGE (PushToken rows) ===');
  let pg, client, rows = [];
  try {
    pg = require('pg');
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const count = await client.query('SELECT COUNT(*)::int AS n FROM "PushToken"');
    console.log(`total PushToken rows: ${count.rows[0].n}`);
    const res = await client.query(
      `SELECT p."userId", u.email, p.platform, substr(p.token,1,12) AS token_prefix, p."createdAt"
         FROM "PushToken" p JOIN "User" u ON u.id = p."userId"
        ORDER BY p."createdAt" DESC LIMIT 50`,
    );
    rows = res.rows;
    if (!rows.length) console.log('  (no rows — device never uploaded a token; break is UPSTREAM of the backend)');
    for (const r of rows) {
      console.log(`  - ${r.email} | ${r.platform} | ${r.token_prefix}… | ${new Date(r.createdAt).toISOString()}`);
    }
  } catch (e) {
    console.log(`  DB query failed: ${e.message}`);
  }

  // ---- 5) LIVE SEND to real tokens (only with `send`) ------------------------
  const mode = process.argv[2];
  const emailFilter = process.argv[3];
  if (mode === 'send' && rows.length) {
    console.log('\n=== [5b] LIVE TEST-SEND to real iOS tokens ===');
    // Re-read full tokens (we only had prefixes above).
    const q = emailFilter
      ? await client.query(`SELECT p.token, u.email FROM "PushToken" p JOIN "User" u ON u.id=p."userId" WHERE p.platform='ios' AND u.email=$1`, [emailFilter])
      : await client.query(`SELECT p.token, u.email FROM "PushToken" p JOIN "User" u ON u.id=p."userId" WHERE p.platform='ios'`);
    if (!q.rows.length) console.log(`  no ios tokens${emailFilter ? ' for ' + emailFilter : ''}`);
    for (const row of q.rows) {
      const r = await apnsSend(row.token, payloadFor({}));
      console.log(`  ${row.email}: status=${r.status} apns-id=${r.apnsId} reason=${r.reason || r.error || ''} => ${interpret(r)}`);
    }
  } else if (mode === 'send') {
    console.log('\n[5b] skipped — no tokens to send to.');
  } else {
    console.log('\n[5b] real send skipped (pass `send` to deliver a test alert to stored tokens).');
  }

  if (client) await client.end().catch(() => {});

  console.log('\n=== VERDICT ===');
  if (probe.status === 400 && /BadDeviceToken/.test(probe.reason)) {
    console.log('AUTH to APNs is GOOD (got BadDeviceToken on a fake token). The .p8/keyId/teamId/JWT all work.');
    console.log(rows.length
      ? 'Tokens exist — see [5b] for the real-device result; a 200 there means the backend is fully RULED OUT.'
      : 'No PushToken rows — the backend can sign+reach APNs, but has nothing to send to. Break is the iOS token upload (upstream).');
  } else if (probe.status === 403) {
    console.log('AUTH to APNs is BROKEN (403). Fix the .p8 / APNS_KEY_ID / APNS_TEAM_ID / server clock. Backend is the cause.');
  } else {
    console.log(`Unexpected probe result (status ${probe.status}). See [5a] above.`);
  }
  line();
})();
