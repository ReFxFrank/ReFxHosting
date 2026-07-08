import { BadRequestException } from '@nestjs/common';
import { validateVanityLabel } from './vanity-address.util';

describe('validateVanityLabel', () => {
  it('accepts and normalizes a plain word', () => {
    expect(validateVanityLabel('  MyServer ')).toBe('myserver');
    expect(validateVanityLabel('epic-smp')).toBe('epic-smp');
    expect(validateVanityLabel('abc')).toBe('abc');
    expect(validateVanityLabel('a'.repeat(32))).toBe('a'.repeat(32));
  });

  it.each([
    ['', 'empty'],
    ['ab', 'too short'],
    ['a'.repeat(33), 'too long'],
    ['-leading', 'leading hyphen'],
    ['trailing-', 'trailing hyphen'],
    ['has space', 'space'],
    ['under_score', 'underscore'],
    ['dot.name', 'dot'],
    ['Ünïcode', 'non-ascii survives lowercase but fails regex'],
  ])('rejects %s (%s)', (input) => {
    expect(() => validateVanityLabel(input)).toThrow(BadRequestException);
  });

  it('rejects punycode/IDNA look-alikes', () => {
    expect(() => validateVanityLabel('xn--fake')).toThrow(BadRequestException);
    expect(() => validateVanityLabel('ab--cd')).toThrow(BadRequestException);
  });

  it('rejects 8-hex shortId-shaped labels but allows near misses', () => {
    expect(() => validateVanityLabel('088a778c')).toThrow(BadRequestException);
    expect(() => validateVanityLabel('deadbeef')).toThrow(BadRequestException);
    expect(validateVanityLabel('deadbeefs')).toBe('deadbeefs'); // 9 chars — fine
    expect(validateVanityLabel('deadbeeg')).toBe('deadbeeg'); // 'g' not hex — fine
  });

  it('rejects built-in reserved words case-insensitively', () => {
    for (const w of ['www', 'Admin', 'REFX', 'support', 'billing']) {
      expect(() => validateVanityLabel(w)).toThrow(BadRequestException);
    }
  });

  it('honors admin-extended reserved words', () => {
    expect(() => validateVanityLabel('grief', ['grief'])).toThrow(
      BadRequestException,
    );
    expect(validateVanityLabel('grief')).toBe('grief'); // not built-in
  });
});
