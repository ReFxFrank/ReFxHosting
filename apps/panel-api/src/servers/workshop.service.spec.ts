import { WorkshopService } from './workshop.service';

/** parseId is the security/UX-critical bit: pull a published-file id from raw
 *  input or a Steam Workshop URL, and reject junk. Tested directly (no I/O). */
const parseId = (input: string): string | null =>
  (WorkshopService as unknown as { parseId(s: string): string | null }).parseId(input);

describe('WorkshopService.parseId', () => {
  it('accepts a bare numeric id', () => {
    expect(parseId('2803054784')).toBe('2803054784');
    expect(parseId('  123456 ')).toBe('123456');
  });

  it('extracts the id from a Workshop URL', () => {
    expect(
      parseId('https://steamcommunity.com/sharedfiles/filedetails/?id=2803054784'),
    ).toBe('2803054784');
    expect(
      parseId('steamcommunity.com/workshop/filedetails/?id=987654321&searchtext=x'),
    ).toBe('987654321');
  });

  it('rejects input with no id', () => {
    expect(parseId('not-a-link')).toBeNull();
    expect(parseId('')).toBeNull();
    expect(parseId('https://example.com/foo')).toBeNull();
  });
});
