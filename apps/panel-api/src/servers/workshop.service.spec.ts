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

describe('WorkshopService.status', () => {
  const NODE = { id: 'node-1' };
  let prisma: {
    server: { findFirst: jest.Mock };
    workshopMod: { findMany: jest.Mock };
    serverVariable: { findUnique: jest.Mock };
  };
  let agent: { listFiles: jest.Mock };
  let svc: WorkshopService;

  const steamcmdTemplate = {
    supportsWorkshop: true,
    workshopAppId: 107410,
    steamAppId: 233780,
    startupCommand: 'bash refx-run.sh',
    installScript: { script: 'steamcmd +workshop_download_item loop' },
  };
  const mod = (id: string, workshopId: string, over: Record<string, unknown> = {}) => ({
    id,
    workshopId,
    kind: 'ITEM',
    enabled: true,
    ...over,
  });

  beforeEach(() => {
    prisma = {
      server: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'srv-1',
          node: NODE,
          template: steamcmdTemplate,
        }),
      },
      workshopMod: {
        findMany: jest
          .fn()
          .mockResolvedValue([mod('m1', '111'), mod('m2', '222')]),
      },
      serverVariable: {
        findUnique: jest.fn().mockResolvedValue({ value: '111 222' }),
      },
    };
    agent = { listFiles: jest.fn().mockResolvedValue([{ name: '111', isDir: true }]) };
    svc = new WorkshopService(prisma as never, { add: jest.fn() } as never, agent as never);
  });

  it('disk-checks steamcmd games against the workshop content dir', async () => {
    const st = await svc.status('srv-1');
    expect(st.mode).toBe('STEAMCMD');
    expect(agent.listFiles).toHaveBeenCalledWith(
      NODE,
      'srv-1',
      'steamapps/workshop/content/107410',
    );
    const by = Object.fromEntries(st.items.map((i) => [i.workshopId, i]));
    expect(by['111']).toMatchObject({ downloaded: true, applied: true });
    expect(by['222']).toMatchObject({ downloaded: false, applied: true });
  });

  it('reports runtime-collection games as RUNTIME with unknown disk state', async () => {
    prisma.server.findFirst.mockResolvedValue({
      id: 'srv-1',
      node: NODE,
      template: {
        ...steamcmdTemplate,
        startupCommand: '+host_workshop_collection {{WORKSHOP_ID}}',
      },
    });
    const st = await svc.status('srv-1');
    expect(st.mode).toBe('RUNTIME');
    expect(st.items.every((i) => i.downloaded === null)).toBe(true);
    expect(agent.listFiles).not.toHaveBeenCalled();
  });

  it('degrades to nothing-downloaded when the content dir is missing/unreachable', async () => {
    agent.listFiles.mockRejectedValue(new Error('no such dir'));
    prisma.serverVariable.findUnique.mockResolvedValue(null);
    const st = await svc.status('srv-1');
    expect(st.items.every((i) => i.downloaded === false && i.applied === false)).toBe(true);
  });
});
