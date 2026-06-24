import { sniServerName } from './agent.client';

describe('sniServerName (TLS SNI for node hosts)', () => {
  it('omits SNI for raw IPv4 hosts — Node rejects an IP servername (RFC 6066)', () => {
    // Regression: a raw-IP node used to send servername=<IP>, which throws on
    // newer Node ("Setting the TLS ServerName to an IP address is not permitted")
    // and broke both cert capture (re-pin) and the pinned dispatcher.
    expect(sniServerName('167.114.209.143')).toBeUndefined();
    expect(sniServerName('10.0.0.1')).toBeUndefined();
  });

  it('omits SNI for IPv6 hosts', () => {
    expect(sniServerName('::1')).toBeUndefined();
    expect(sniServerName('2001:db8::1')).toBeUndefined();
  });

  it('keeps the hostname as SNI for FQDN hosts', () => {
    expect(sniServerName('node1.example.com')).toBe('node1.example.com');
    expect(sniServerName('localhost')).toBe('localhost');
  });
});
