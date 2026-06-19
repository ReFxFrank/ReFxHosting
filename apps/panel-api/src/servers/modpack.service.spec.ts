import { ModpackService } from './modpack.service';

/**
 * Regression: the agent serves files as raw octet-stream, so NodeAgentClient
 * .readFile resolves to a plain string. installed() must parse that (it used to
 * destructure `{ content }` off the string, so JSON.parse(undefined) threw and
 * the Modpacks tab never showed the installed pack / uninstall button).
 */
describe('ModpackService.installed', () => {
  const make = (readFile: (...a: any[]) => Promise<unknown>) => {
    const prisma = {
      server: {
        findFirst: jest.fn().mockResolvedValue({
          id: 's1',
          state: 'OFFLINE',
          node: { id: 'n1' },
          template: { slug: 'minecraft' },
        }),
      },
    };
    const agent = { readFile: jest.fn(readFile) };
    const svc = new ModpackService(
      prisma as any,
      {} as any,
      agent as any,
      {} as any,
    );
    return { svc };
  };

  it('parses the marker when the agent returns raw JSON text (string)', async () => {
    const marker = {
      projectId: 'p',
      title: 'COBBLEVERSE',
      loader: 'fabric',
      filesInstalled: 42,
    };
    const { svc } = make(async () => JSON.stringify(marker));
    await expect(svc.installed('s1')).resolves.toEqual({ installed: marker });
  });

  it('also tolerates a { content } shaped response', async () => {
    const marker = { title: 'Pack' };
    const { svc } = make(async () => ({ content: JSON.stringify(marker) }));
    await expect(svc.installed('s1')).resolves.toEqual({ installed: marker });
  });

  it('returns null when no marker exists (empty body or read error)', async () => {
    const { svc: empty } = make(async () => '');
    await expect(empty.installed('s1')).resolves.toEqual({ installed: null });

    const { svc: err } = make(async () => {
      throw new Error('not found');
    });
    await expect(err.installed('s1')).resolves.toEqual({ installed: null });
  });
});
