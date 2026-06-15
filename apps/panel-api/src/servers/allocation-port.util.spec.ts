import {
  PORT_RANGE_START,
  PORT_RANGE_END,
  pickFreePort,
  isPortEnvName,
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
