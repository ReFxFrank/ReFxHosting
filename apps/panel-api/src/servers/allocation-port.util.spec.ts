import {
  PORT_RANGE_START,
  PORT_RANGE_END,
  pickFreePort,
  isPortEnvName,
  buildAllocationAlias,
  normalizeGameDomain,
} from './allocation-port.util';

describe('pickFreePort', () => {
  it('returns the range start when nothing is taken', () => {
    expect(pickFreePort([])).toBe(PORT_RANGE_START);
  });

  it('skips taken ports and returns the lowest free one', () => {
    expect(pickFreePort([PORT_RANGE_START, PORT_RANGE_START + 1])).toBe(
      PORT_RANGE_START + 2,
    );
  });

  it('ignores out-of-order and duplicate taken ports', () => {
    const taken = [
      PORT_RANGE_START + 2,
      PORT_RANGE_START,
      PORT_RANGE_START + 2,
      PORT_RANGE_START + 1,
    ];
    expect(pickFreePort(taken)).toBe(PORT_RANGE_START + 3);
  });

  it('honors custom ranges', () => {
    expect(pickFreePort([100, 101], 100, 105)).toBe(102);
  });

  it('falls back to start when the range is fully exhausted', () => {
    const taken: number[] = [];
    for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) taken.push(p);
    expect(pickFreePort(taken)).toBe(PORT_RANGE_START);
  });
});

describe('isPortEnvName', () => {
  it.each(['SERVER_PORT', 'QUERY_PORT', 'rcon_port', 'PortNumber'])(
    'recognizes %s as port-like',
    (name) => {
      expect(isPortEnvName(name)).toBe(true);
    },
  );

  it.each(['SERVER_MEMORY', 'SERVER_JARFILE', 'MAX_PLAYERS'])(
    'does not flag %s',
    (name) => {
      expect(isPortEnvName(name)).toBe(false);
    },
  );
});

describe('normalizeGameDomain', () => {
  it('returns null for empty/whitespace', () => {
    expect(normalizeGameDomain('')).toBeNull();
    expect(normalizeGameDomain('   ')).toBeNull();
    expect(normalizeGameDomain(null)).toBeNull();
    expect(normalizeGameDomain(undefined)).toBeNull();
  });

  it('lower-cases and trims', () => {
    expect(normalizeGameDomain('  FRA.ReFx.GG ')).toBe('fra.refx.gg');
  });

  it('strips a scheme, wildcard label and surrounding dots', () => {
    expect(normalizeGameDomain('https://fra.refx.gg')).toBe('fra.refx.gg');
    expect(normalizeGameDomain('*.fra.refx.gg')).toBe('fra.refx.gg');
    expect(normalizeGameDomain('.fra.refx.gg.')).toBe('fra.refx.gg');
  });
});

describe('buildAllocationAlias', () => {
  it('returns null when the node has no game domain', () => {
    expect(buildAllocationAlias('Ab12Cd', null)).toBeNull();
    expect(buildAllocationAlias('Ab12Cd', '')).toBeNull();
  });

  it('builds <shortId>.<domain>, lower-cased', () => {
    expect(buildAllocationAlias('Ab12Cd', 'fra.refx.gg')).toBe('ab12cd.fra.refx.gg');
  });

  it('normalizes the domain (scheme/wildcard/dots)', () => {
    expect(buildAllocationAlias('x1', '*.NYC.refx.gg.')).toBe('x1.nyc.refx.gg');
  });

  it('drops non-DNS-safe chars from the shortId label', () => {
    expect(buildAllocationAlias('a_b.c1', 'fra.refx.gg')).toBe('abc1.fra.refx.gg');
  });

  it('returns null when the shortId has no usable chars', () => {
    expect(buildAllocationAlias('___', 'fra.refx.gg')).toBeNull();
  });
});
