import {
  essentialExcludes,
  mergeExcludes,
} from './backup-profiles.util';

describe('backup profiles', () => {
  it('detects Minecraft by template slug prefix', () => {
    for (const slug of ['minecraft', 'minecraft-fabric', 'minecraft-paper']) {
      const globs = essentialExcludes(slug, {});
      expect(globs).toContain('libraries');
      expect(globs).toContain('versions');
      expect(globs).toContain('logs');
    }
  });

  it('detects Minecraft by MINECRAFT_VERSION env (post game-switch)', () => {
    const globs = essentialExcludes('some-legacy-slug', {
      MINECRAFT_VERSION: '1.21.1',
    });
    expect(globs).toContain('libraries');
  });

  it('non-Minecraft games only skip generic regenerables', () => {
    const globs = essentialExcludes('valheim', {});
    expect(globs).toContain('logs');
    expect(globs).toContain('cache');
    expect(globs).not.toContain('libraries');
  });

  it('never excludes redeploy-critical content', () => {
    const globs = essentialExcludes('minecraft', {});
    for (const critical of [
      'world',
      'mods',
      'plugins',
      'config',
      'server.properties',
    ]) {
      expect(globs).not.toContain(critical);
    }
  });

  it('mergeExcludes dedupes and drops empties', () => {
    expect(mergeExcludes(['logs', 'cache'], ['logs', ' ', 'dynmap'])).toEqual([
      'logs',
      'cache',
      'dynmap',
    ]);
  });
});
