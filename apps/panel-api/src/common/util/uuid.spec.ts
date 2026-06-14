import { uuidv7, shortId } from './uuid';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  it('matches the canonical UUID string format', () => {
    expect(uuidv7()).toMatch(UUID_RE);
  });

  it('sets the version nibble to 7', () => {
    const id = uuidv7();
    // version is the first char of the 3rd group.
    expect(id[14]).toBe('7');
  });

  it('sets the RFC 4122 variant bits (10xx => 8/9/a/b)', () => {
    for (let i = 0; i < 50; i++) {
      const id = uuidv7();
      expect('89ab').toContain(id[19]);
    }
  });

  it('encodes a recent timestamp in the high 48 bits', () => {
    const before = Date.now();
    const id = uuidv7();
    const after = Date.now();
    const tsHex = id.slice(0, 8) + id.slice(9, 13); // first 12 hex = 48 bits
    const ts = parseInt(tsHex, 16);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('is time-sortable: later-generated ids sort lexicographically after earlier ones', () => {
    const earlier = uuidv7();
    // Force a later millisecond timestamp.
    const realNow = Date.now;
    const later = (() => {
      jest.spyOn(Date, 'now').mockReturnValue(realNow() + 10_000);
      try {
        return uuidv7();
      } finally {
        (Date.now as jest.Mock).mockRestore();
      }
    })();
    expect(later > earlier).toBe(true);
  });

  it('generates distinct values', () => {
    const set = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(set.size).toBe(1000);
  });
});

describe('shortId', () => {
  it('returns 8 lowercase hex chars', () => {
    expect(shortId()).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is effectively unique across calls', () => {
    const set = new Set(Array.from({ length: 200 }, () => shortId()));
    expect(set.size).toBe(200);
  });
});
