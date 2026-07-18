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

  it('non-Minecraft games without a profile only skip generic regenerables', () => {
    const globs = essentialExcludes('valheim', {});
    expect(globs).toContain('logs');
    expect(globs).toContain('cache');
    expect(globs).not.toContain('libraries');
  });

  it('Palworld excludes the re-downloadable SteamCMD install but keeps Pal/Saved', () => {
    const globs = essentialExcludes('palworld', {});
    // re-downloadable game install + steamcmd scratch are dropped
    for (const g of ['Engine', 'Pal/Binaries', 'Pal/Content', 'steamcmd', 'steamapps']) {
      expect(globs).toContain(g);
    }
    expect(globs).toContain('logs'); // generic still applies
    // the save + config tree must NEVER be excluded (would lose the world)
    expect(globs).not.toContain('Pal');
    expect(globs).not.toContain('Pal/Saved');
    // no glob may be Pal/Saved itself or a prefix of it
    for (const g of globs) {
      expect(g === 'Pal/Saved' || 'Pal/Saved'.startsWith(g.replace(/\/$/, '') + '/')).toBe(false);
    }
  });

  it('Palworld Windows/UE4SS excludes the Proton/wine runtime + game, keeps world + Lua mods', () => {
    const globs = essentialExcludes('palworld-windows', {});
    // Steam + Proton/wine runtime (the failure/bloat source) is dropped...
    for (const g of ['steamcmd', 'steamapps', 'Steam', '.steam', '.proton', '.wine']) {
      expect(globs).toContain(g);
    }
    // ...along with the re-downloadable game content + the ~152 MB server exe.
    for (const g of ['Engine', 'Pal/Content', 'Pal/Plugins', 'Pal/Binaries/Win64/PalServer-Win64-Shipping.exe']) {
      expect(globs).toContain(g);
    }
    // Crucially, UE4SS + the customer's uploaded mods (Win64/ue4ss) are KEPT:
    // we prune only the exe, not the whole Pal/Binaries tree.
    expect(globs).not.toContain('Pal/Binaries');
    // The world/config must NEVER be excluded.
    expect(globs).not.toContain('Pal');
    expect(globs).not.toContain('Pal/Saved');
    for (const g of globs) {
      expect(g === 'Pal/Saved' || 'Pal/Saved'.startsWith(g.replace(/\/$/, '') + '/')).toBe(false);
    }
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
