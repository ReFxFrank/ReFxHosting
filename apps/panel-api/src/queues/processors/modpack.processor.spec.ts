import { ModpackProcessor } from './modpack.processor';

/**
 * Unit tests for the hardened modpack installer's file handling: complete-set
 * download (with retries), thorough mods/ wipe, leftover cleanup, and duplicate
 * detection. The agent + collaborators are mocked; these cover the logic that
 * prevents the "Unbound values in registry worldgen/structure" boot crash from a
 * partial or dirty install.
 */
describe('ModpackProcessor (install hardening)', () => {
  const NODE = { id: 'n1' } as any;
  let agent: {
    listFiles: jest.Mock;
    deleteFiles: jest.Mock;
    downloadToPath: jest.Mock;
  };
  let proc: ModpackProcessor;

  beforeEach(() => {
    agent = {
      listFiles: jest.fn(),
      deleteFiles: jest.fn().mockResolvedValue(undefined),
      downloadToPath: jest.fn().mockResolvedValue(undefined),
    };
    proc = new ModpackProcessor(
      {} as any,
      agent as any,
      {} as any,
      {} as any,
      {} as any,
    );
    // Make retry backoff instant so tests don't wait real seconds.
    jest.spyOn(proc as any, 'sleep').mockResolvedValue(undefined);
  });

  describe('downloadServerFiles', () => {
    it('installs server-required files, skips client-only, flags un-fetchable as missing', async () => {
      const index = {
        files: [
          { path: 'mods/a.jar', downloads: ['https://cdn.modrinth.com/a.jar'] },
          {
            path: 'mods/client.jar',
            downloads: ['https://cdn.modrinth.com/c.jar'],
            env: { server: 'unsupported' },
          },
          { path: 'mods/nohost.jar', downloads: ['https://example.com/x.jar'] },
          { path: 'mods/nourl.jar', downloads: [] },
        ],
      };
      const r = await (proc as any).downloadServerFiles(NODE, 's1', index);
      expect(r.installed).toBe(1);
      expect(r.clientOnly).toBe(1);
      expect(r.missing.sort()).toEqual(['mods/nohost.jar', 'mods/nourl.jar']);
      expect(agent.downloadToPath).toHaveBeenCalledTimes(1);
    });

    it('retries a failing download and only reports it missing after the cap', async () => {
      agent.downloadToPath.mockRejectedValue(new Error('429 rate limited'));
      const index = {
        files: [
          { path: 'mods/a.jar', downloads: ['https://cdn.modrinth.com/a.jar'] },
        ],
      };
      const r = await (proc as any).downloadServerFiles(NODE, 's1', index);
      expect(agent.downloadToPath).toHaveBeenCalledTimes(3); // 3 attempts
      expect(r.missing).toEqual(['mods/a.jar']);
      expect(r.installed).toBe(0);
    });

    it('succeeds when a retry eventually lands', async () => {
      agent.downloadToPath
        .mockRejectedValueOnce(new Error('429'))
        .mockResolvedValueOnce(undefined);
      const index = {
        files: [
          { path: 'mods/a.jar', downloads: ['https://cdn.modrinth.com/a.jar'] },
        ],
      };
      const r = await (proc as any).downloadServerFiles(NODE, 's1', index);
      expect(r.installed).toBe(1);
      expect(r.missing).toEqual([]);
    });
  });

  describe('wipeModsDir', () => {
    it('deletes every entry under mods/ (jars, disabled, nested dirs)', async () => {
      agent.listFiles.mockResolvedValue([
        { name: 'a.jar' },
        { name: 'sub', isDir: true },
        { name: 'b.jar.disabled' },
      ]);
      await (proc as any).wipeModsDir(NODE, 's1');
      expect(agent.deleteFiles).toHaveBeenCalledWith(NODE, 's1', [
        'mods/a.jar',
        'mods/sub',
        'mods/b.jar.disabled',
      ]);
    });

    it('no-ops when mods/ does not exist yet', async () => {
      agent.listFiles.mockRejectedValue(new Error('not found'));
      await (proc as any).wipeModsDir(NODE, 's1');
      expect(agent.deleteFiles).not.toHaveBeenCalled();
    });

    it('propagates a delete failure so the install aborts (no dirty union)', async () => {
      agent.listFiles.mockResolvedValue([{ name: 'a.jar' }]);
      agent.deleteFiles.mockRejectedValue(new Error('EACCES'));
      await expect((proc as any).wipeModsDir(NODE, 's1')).rejects.toThrow(
        'EACCES',
      );
    });
  });

  describe('clearPackContent', () => {
    it('wipes mods/ then best-effort clears leftover datapacks (never throws on those)', async () => {
      agent.listFiles.mockResolvedValue([{ name: 'old.jar' }]);
      agent.deleteFiles
        .mockResolvedValueOnce(undefined) // mods wipe
        .mockRejectedValueOnce(new Error('no datapacks here')); // datapacks best-effort
      await expect(
        (proc as any).clearPackContent(NODE, 's1'),
      ).resolves.toBeUndefined();
      expect(agent.deleteFiles).toHaveBeenNthCalledWith(1, NODE, 's1', [
        'mods/old.jar',
      ]);
      expect(agent.deleteFiles).toHaveBeenNthCalledWith(2, NODE, 's1', [
        'datapacks',
        'world/datapacks',
      ]);
    });
  });

  describe('stripClientOnlyMods', () => {
    it('removes known client-only jars (Forge server crash) and keeps server mods', async () => {
      agent.listFiles.mockResolvedValue([
        { name: 'oculus-mc1.20.1-1.7.0.jar' },
        { name: 'entity_model_features_forge_1.20.1-2.2.2.jar' },
        { name: 'citresewn-1.1.3+1.20.1.jar' },
        { name: 'DungeonsAriseSevenSeas-1.20.x-1.0.2-forge.jar' },
        { name: 'fabric-api-0.92.2.jar' },
        { name: 'config', isDir: true },
      ]);
      const stripped = await (proc as any).stripClientOnlyMods(NODE, 's1');
      expect(stripped.sort()).toEqual([
        'mods/citresewn-1.1.3+1.20.1.jar',
        'mods/entity_model_features_forge_1.20.1-2.2.2.jar',
        'mods/oculus-mc1.20.1-1.7.0.jar',
      ]);
      expect(agent.deleteFiles).toHaveBeenCalledWith(NODE, 's1', stripped);
    });

    it('is a no-op when there are no client-only jars', async () => {
      agent.listFiles.mockResolvedValue([
        { name: 'DungeonsAriseSevenSeas-1.20.x-1.0.2-fabric.jar' },
        { name: 'fabric-api-0.92.2.jar' },
      ]);
      const stripped = await (proc as any).stripClientOnlyMods(NODE, 's1');
      expect(stripped).toEqual([]);
      expect(agent.deleteFiles).not.toHaveBeenCalled();
    });
  });

  describe('warnOnDuplicateJars', () => {
    it('flags two versions of the same mod and ignores distinct mods', async () => {
      agent.listFiles.mockResolvedValue([
        { name: 'sodium-fabric-0.5.3.jar' },
        { name: 'sodium-fabric-0.5.8.jar' },
        { name: 'cloth-config-11.1.106-fabric.jar' },
        { name: 'somedir', isDir: true },
      ]);
      const dups = await (proc as any).warnOnDuplicateJars(NODE, 's1');
      expect(dups.sort()).toEqual([
        'sodium-fabric-0.5.3.jar',
        'sodium-fabric-0.5.8.jar',
      ]);
    });

    it('returns nothing when mods/ has no duplicates', async () => {
      agent.listFiles.mockResolvedValue([
        { name: 'DungeonsAriseSevenSeas-1.20.x-1.0.2-fabric.jar' },
        { name: 'fabric-api-0.92.2+1.20.1.jar' },
      ]);
      const dups = await (proc as any).warnOnDuplicateJars(NODE, 's1');
      expect(dups).toEqual([]);
    });
  });
});
