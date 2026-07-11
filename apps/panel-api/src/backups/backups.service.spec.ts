import { BackupsService } from './backups.service';

describe('BackupsService lifecycle', () => {
  const NODE = { id: 'node-1', fqdn: '1.2.3.4' };
  const SERVER = {
    id: 'srv-1',
    nodeId: 'node-1',
    node: NODE,
    template: { slug: 'minecraft' },
    environment: { MINECRAFT_VERSION: '1.21.1' },
  };
  const BACKUP = {
    id: 'bak-1',
    serverId: 'srv-1',
    name: 'weekly',
    state: 'COMPLETED',
    location: '/var/lib/refx/backups/bak-1.tar.gz',
    isLocked: false,
  };

  let prisma: any;
  let agent: any;
  let svc: BackupsService;

  beforeEach(() => {
    prisma = {
      server: { findFirst: jest.fn().mockResolvedValue(SERVER) },
      backup: {
        count: jest.fn().mockResolvedValue(0),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...data })),
        findFirst: jest.fn().mockResolvedValue({ ...BACKUP }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...BACKUP, ...data }),
        ),
        delete: jest.fn().mockResolvedValue(BACKUP),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    agent = {
      deleteBackup: jest.fn().mockResolvedValue({}),
      restoreBackup: jest.fn().mockResolvedValue({}),
      backupStream: jest.fn().mockResolvedValue({} as ReadableStream),
    };
    const config = { get: jest.fn().mockReturnValue('0'.repeat(64)) } as any;
    const queue = { add: jest.fn() } as any;
    svc = new BackupsService(prisma, agent, config, queue);
  });

  describe('create modes', () => {
    it('ESSENTIALS prepends the game profile to the user globs', async () => {
      await svc.create('srv-1', {
        name: 'weekly',
        mode: 'ESSENTIALS',
        ignoredFiles: ['dynmap'],
      });
      const data = prisma.backup.create.mock.calls[0][0].data;
      expect(data.ignoredFiles).toEqual(
        expect.arrayContaining(['libraries', 'versions', 'logs', 'dynmap']),
      );
      // Redeploy-critical content is never excluded.
      expect(data.ignoredFiles).not.toContain('world');
      expect(data.ignoredFiles).not.toContain('mods');
    });

    it('FULL (and default) keeps only the user globs', async () => {
      await svc.create('srv-1', { name: 'full', ignoredFiles: ['dynmap'] });
      const data = prisma.backup.create.mock.calls[0][0].data;
      expect(data.ignoredFiles).toEqual(['dynmap']);
    });
  });

  describe('createScheduled rotation', () => {
    it('under the cap: creates without rotating', async () => {
      prisma.backup.count.mockResolvedValue(3);
      await svc.createScheduled('srv-1', 'nightly', 'ESSENTIALS');
      expect(prisma.backup.delete).not.toHaveBeenCalled();
      const data = prisma.backup.create.mock.calls[0][0].data;
      expect(data.ignoredFiles).toEqual(expect.arrayContaining(['libraries']));
    });

    it('at the cap: rotates the oldest unlocked completed backup first', async () => {
      prisma.backup.count.mockResolvedValueOnce(25).mockResolvedValue(24);
      await svc.createScheduled('srv-1', 'nightly', 'FULL');
      // Oldest-first lookup restricted to unlocked, completed backups.
      expect(prisma.backup.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serverId: 'srv-1', isLocked: false, state: 'COMPLETED' },
          orderBy: { createdAt: 'asc' },
        }),
      );
      expect(prisma.backup.delete).toHaveBeenCalledWith({
        where: { id: 'bak-1' },
      });
      expect(prisma.backup.create).toHaveBeenCalled();
    });

    it('fails cleanly when the cap is hit and everything is locked', async () => {
      prisma.backup.count.mockResolvedValue(25);
      prisma.backup.findFirst.mockResolvedValue(null);
      await expect(
        svc.createScheduled('srv-1', 'nightly', 'ESSENTIALS'),
      ).rejects.toThrow(/locked/i);
      expect(prisma.backup.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('passes the archive location to the agent, then deletes the row', async () => {
      await svc.remove('srv-1', 'bak-1');
      expect(agent.deleteBackup).toHaveBeenCalledWith(
        NODE,
        'srv-1',
        'bak-1',
        BACKUP.location,
      );
      expect(prisma.backup.delete).toHaveBeenCalledWith({
        where: { id: 'bak-1' },
      });
    });

    it('skips the agent entirely when no archive was ever stored', async () => {
      prisma.backup.findFirst.mockResolvedValue({
        ...BACKUP,
        state: 'FAILED',
        location: null,
      });
      await svc.remove('srv-1', 'bak-1');
      expect(agent.deleteBackup).not.toHaveBeenCalled();
      expect(prisma.backup.delete).toHaveBeenCalled();
    });

    it('still deletes the row when the agent is unreachable (best-effort)', async () => {
      agent.deleteBackup.mockRejectedValue(new Error('node offline'));
      await svc.remove('srv-1', 'bak-1');
      expect(prisma.backup.delete).toHaveBeenCalled();
    });

    it('refuses to delete a locked backup', async () => {
      prisma.backup.findFirst.mockResolvedValue({ ...BACKUP, isLocked: true });
      await expect(svc.remove('srv-1', 'bak-1')).rejects.toThrow(/locked/i);
      expect(prisma.backup.delete).not.toHaveBeenCalled();
    });
  });

  it('setLocked toggles the flag', async () => {
    const res = await svc.setLocked('srv-1', 'bak-1', true);
    expect(prisma.backup.update).toHaveBeenCalledWith({
      where: { id: 'bak-1' },
      data: { isLocked: true },
    });
    expect(res.isLocked).toBe(true);
  });

  it('restore sends the archive location and requires COMPLETED', async () => {
    await svc.restore('srv-1', 'bak-1');
    expect(agent.restoreBackup).toHaveBeenCalledWith(
      NODE,
      'srv-1',
      'bak-1',
      BACKUP.location,
    );
    prisma.backup.findFirst.mockResolvedValue({
      ...BACKUP,
      state: 'IN_PROGRESS',
    });
    await expect(svc.restore('srv-1', 'bak-1')).rejects.toThrow(/not ready/i);
  });

  describe('signed downloads', () => {
    it('mints a relative signed URL that openSignedDownload accepts', async () => {
      const { url } = await svc.downloadUrl('srv-1', 'bak-1');
      const parsed = new URL(url, 'http://x');
      expect(parsed.pathname).toBe('/servers/srv-1/backups/bak-1/archive');
      const exp = parsed.searchParams.get('exp')!;
      const sig = parsed.searchParams.get('sig')!;
      const res = await svc.openSignedDownload('srv-1', 'bak-1', exp, sig);
      expect(agent.backupStream).toHaveBeenCalledWith(
        NODE,
        'srv-1',
        'bak-1',
        BACKUP.location,
      );
      expect(res.filename).toBe('weekly-bak-1.tar.gz');
    });

    it('rejects a tampered signature and an expired link', async () => {
      const { url } = await svc.downloadUrl('srv-1', 'bak-1');
      const parsed = new URL(url, 'http://x');
      const exp = parsed.searchParams.get('exp')!;
      await expect(
        svc.openSignedDownload('srv-1', 'bak-1', exp, 'f'.repeat(64)),
      ).rejects.toThrow(/signature/i);
      const past = String(Math.floor(Date.now() / 1000) - 10);
      await expect(
        svc.openSignedDownload('srv-1', 'bak-1', past, 'x'),
      ).rejects.toThrow(/expired/i);
    });

    it('refuses to mint for a backup without a stored archive', async () => {
      prisma.backup.findFirst.mockResolvedValue({
        ...BACKUP,
        state: 'FAILED',
        location: null,
      });
      await expect(svc.downloadUrl('srv-1', 'bak-1')).rejects.toThrow(
        /no stored archive/i,
      );
    });
  });
});
