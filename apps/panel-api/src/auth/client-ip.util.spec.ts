import { resolveClientIp } from './client-ip.util';

describe('resolveClientIp', () => {
  it('falls back to req.ip when no header is configured', () => {
    expect(resolveClientIp({ ip: '1.2.3.4', headers: {} }, undefined)).toBe('1.2.3.4');
  });

  it('prefers the configured trusted header (CF-Connecting-IP behind Cloudflare)', () => {
    const req = {
      ip: '172.70.127.155', // Cloudflare edge — what req.ip wrongly resolves to
      headers: { 'cf-connecting-ip': '15.204.252.217' },
    };
    expect(resolveClientIp(req, 'cf-connecting-ip')).toBe('15.204.252.217');
  });

  it('takes the first entry of a comma-separated forwarded list', () => {
    const req = { ip: '10.0.0.1', headers: { 'x-forwarded-for': '15.204.252.217, 172.70.1.2' } };
    expect(resolveClientIp(req, 'x-forwarded-for')).toBe('15.204.252.217');
  });

  it('handles a header delivered as an array', () => {
    const req = { ip: '10.0.0.1', headers: { 'cf-connecting-ip': ['15.204.252.217'] as unknown as string } };
    expect(resolveClientIp(req, 'cf-connecting-ip')).toBe('15.204.252.217');
  });

  it('falls back to req.ip when the configured header is absent or empty', () => {
    expect(resolveClientIp({ ip: '1.2.3.4', headers: {} }, 'cf-connecting-ip')).toBe('1.2.3.4');
    expect(resolveClientIp({ ip: '1.2.3.4', headers: { 'cf-connecting-ip': '' } }, 'cf-connecting-ip')).toBe('1.2.3.4');
  });
});
