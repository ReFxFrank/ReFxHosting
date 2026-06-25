import { signRequest, signRequestRaw } from './agent.signing';

describe('agent signing — query coverage flag', () => {
  const key = 'node-key';
  const ts = '1700000000';
  const a = '/api/v1/servers/abc/files/write?path=%2Ffoo';
  const b = '/api/v1/servers/abc/files/write?path=%2Fetc%2Fpasswd';

  it('legacy (default) does NOT cover the query — same path, different query → same signature', () => {
    expect(signRequest(key, 'POST', a, ts, '')).toBe(signRequest(key, 'POST', b, ts, ''));
  });

  it('includeQuery covers the query — different query → different signature', () => {
    expect(signRequest(key, 'POST', a, ts, '', true)).not.toBe(
      signRequest(key, 'POST', b, ts, '', true),
    );
  });

  it('raw-body signer honours includeQuery too', () => {
    const body = new Uint8Array([1, 2, 3]);
    expect(signRequestRaw(key, 'POST', a, ts, body, true)).not.toBe(
      signRequestRaw(key, 'POST', b, ts, body, true),
    );
  });
});
