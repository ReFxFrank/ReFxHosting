package backup

import "testing"

// Cross-language safety contract for the Palworld essentials backup profile.
// The panel computes exclude globs (backup-profiles.util.ts PALWORLD_EXCLUDES);
// the agent applies them here. A too-broad glob would silently drop the
// customer's world on the next backup, so this pins the exact matching
// behaviour: the re-downloadable SteamCMD install is pruned, but Pal/Saved
// (SaveGames + Config) is always kept.
func TestIsIgnoredPalworldKeepsSaves(t *testing.T) {
	// Mirror of PALWORLD_EXCLUDES (kept in lock-step with backup-profiles.util.ts).
	globs := []string{
		"logs", "crash-reports", "cache", ".cache", "tmp", "temp", "*.log",
		"steamcmd", "steamapps", "Engine",
		"Pal/Binaries", "Pal/Content", "Pal/Plugins",
	}

	ignored := []string{
		"Engine",
		"Engine/Binaries/Linux/libUnrealEditor.so",
		"Pal/Binaries",
		"Pal/Binaries/Linux/PalServer-Linux-Shipping",
		"Pal/Content",
		"Pal/Content/Paks/Pal-Linux.pak",
		"Pal/Plugins",
		"Pal/Plugins/Wwise/x.so",
		"steamcmd",
		"steamcmd/steamcmd.sh",
		"steamapps",
		"steamapps/appmanifest_2394010.acf",
		"server.log",
		"logs/PalServer.log",
	}
	for _, p := range ignored {
		if !isIgnored(p, globs) {
			t.Errorf("expected %q to be EXCLUDED, but it was kept", p)
		}
	}

	// The critical set: everything the customer needs to redeploy must survive.
	kept := []string{
		"Pal",
		"Pal/Saved",
		"Pal/Saved/SaveGames",
		"Pal/Saved/SaveGames/0/ABCDEF/Level.sav",
		"Pal/Saved/SaveGames/0/ABCDEF/Players/xyz.sav",
		"Pal/Saved/Config",
		"Pal/Saved/Config/LinuxServer/PalWorldSettings.ini",
		"Pal/Saved/Config/LinuxServer/GameUserSettings.ini",
		"PalServer.sh",
		"refx-palworld-run.sh",
		// A directory whose name merely starts with an excluded name must NOT be
		// pruned by the prefix rule (e.g. "Pal/Contents" is not "Pal/Content").
		"Pal/Contented/keep.txt",
	}
	for _, p := range kept {
		if isIgnored(p, globs) {
			t.Errorf("expected %q to be KEPT, but it was excluded", p)
		}
	}
}
