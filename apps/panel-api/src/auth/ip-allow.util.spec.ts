import { ipAllowed, ipMatchesEntry, normalizeIp } from './ip-allow.util';

describe('ip-allow.util', () => {
  it('strips IPv4-mapped IPv6 prefix', () => {
    expect(normalizeIp('::ffff:15.204.252.217')).toBe('15.204.252.217');
    expect(normalizeIp('  15.204.252.217 ')).toBe('15.204.252.217');
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
  });

  it('matches a bare allowlist IP (treated as /32)', () => {
    expect(ipAllowed('15.204.252.217', ['15.204.252.217'])).toBe(true);
    expect(ipAllowed('15.204.252.218', ['15.204.252.217'])).toBe(false);
  });

  it('matches the same IP given as /32', () => {
    expect(ipAllowed('15.204.252.217', ['15.204.252.217/32'])).toBe(true);
  });

  it('matches an IPv4-mapped IPv6 client against an IPv4 allowlist (the proxy bug)', () => {
    // This is the real-world failure: req.ip arrives as ::ffff:<v4> behind a proxy.
    expect(ipAllowed('::ffff:15.204.252.217', ['15.204.252.217'])).toBe(true);
    expect(ipAllowed('::ffff:15.204.252.217', ['15.204.252.217/32'])).toBe(true);
    expect(ipAllowed('::ffff:8.8.8.8', ['15.204.252.217/32'])).toBe(false);
  });

  it('does real CIDR matching', () => {
    expect(ipAllowed('15.204.252.217', ['15.204.252.0/24'])).toBe(true);
    expect(ipAllowed('15.204.253.1', ['15.204.252.0/24'])).toBe(false);
    expect(ipAllowed('::ffff:10.0.5.9', ['10.0.0.0/8'])).toBe(true);
    expect(ipAllowed('1.2.3.4', ['0.0.0.0/0'])).toBe(true); // /0 matches all IPv4
  });

  it('rejects invalid octets / malformed entries instead of false-positives', () => {
    expect(ipMatchesEntry('15.204.252.999', '15.204.252.999')).toBe(false);
    expect(ipMatchesEntry('15.204.252.217', '15.204.252.217/33')).toBe(false);
    expect(ipMatchesEntry('15.204.252.217', '')).toBe(false);
  });

  it('falls back to normalized exact compare for IPv6 entries', () => {
    expect(ipAllowed('2001:db8::1', ['2001:db8::1'])).toBe(true);
    expect(ipAllowed('2001:db8::2', ['2001:db8::1'])).toBe(false);
  });
});
