# Known issues

Every solved ticket lands here. This file is the single highest-leverage thing in the whole skill set: it turns an hour of log-reading into a 30-second lookup, and each entry is also a tutorial page waiting to be written (see `refx-seo-page` — people are searching these exact error strings).

Search this file **before** diagnosing anything from scratch.

## Entry format

Copy this shape. The searchable error string matters most — that's how future-you finds the entry, and it's the title of the tutorial page.

```markdown
### <Short title>
- **Game / stack**: 
- **Class**: A–H (see SKILL.md)
- **Searchable error string**: `<the exact line a customer would paste or Google>`
- **Symptom**: what the customer sees
- **Root cause**: what was actually wrong
- **Fix**: the steps that worked
- **Prevention**: how to stop it recurring
- **Platform bug?**: yes/no — if yes, what needs to change
- **Tutorial written?**: link or "no"
```

---

## Seeded entries

These come from real incidents on the Medieval MC (MMC4) server. Canonical error signatures are filled in below where the failure has a well-known public form. **TODO(frank): confirm each against the exact line in your MMC4 logs / crash reports and tighten it** — the precise string is what makes this file findable later, and it's the exact query a customer will type into Google.

### Mekanism MekaSuit mixin crash on boot

- **Game / stack**: Minecraft, Forge, Medieval MC (MMC4)
- **Class**: B — crash with stack trace
- **Searchable error string**: canonical signature — `Mixin apply failed` … `mixins.json:MekanismEnchantableMekaSuit`, and `org.spongepowered.asm.mixin.injection.throwables.InvalidInjectionException`. TODO(frank): paste the exact line from the crash report — the mod package printed *before* `MekanismEnchantableMekaSuit` names the culprit mod.
- **Symptom**: Server crashes during mod loading, never reaches "Done". No world loads.
- **Root cause**: A mixin from an enchantment-compatibility mod targeting Mekanism's MekaSuit failed to apply — the target class shape didn't match what the mixin expected. Version skew between the patching mod, Mekanism, and the modloader.
- **Fix**: Align versions across the mod, Mekanism, and Forge — the mixin has to be built for the exact Mekanism version installed. Remove the patching mod if the pack doesn't actually need it.
- **Prevention**: Pin pack versions. Don't update one mod inside a curated pack without checking what mixins target it — this is exactly the failure mode packs like MMC4 produce.
- **Platform bug?**: no — pack/mod issue.
- **Tutorial written?**: no ← good candidate. People with this crash are Googling that class name right now.

### Java heap OOM under load

- **Game / stack**: Minecraft, modded (MMC4)
- **Class**: C — out of memory
- **Searchable error string**: `java.lang.OutOfMemoryError: Java heap space`
- **Symptom**: Server hangs, then dies under load. Sometimes long freezes before death (full GCs).
- **Root cause**: Heap undersized for a heavy modpack, compounded by untuned GC. **Check first whether it's a real heap OOM or a container OOM-kill (exit 137) — the fixes are opposite.** See the table in SKILL.md class C.
- **Fix**: Tune the JVM: `-Xms` = `-Xmx`, G1GC with Aikar's flag set, and `-Xmx` sized to leave ~1–1.5 GB of headroom below the container limit (the JVM's non-heap memory — metaspace, thread stacks, direct buffers, GC structures — lives *outside* `-Xmx`).
- **Prevention**: Never ship `-Xmx` == container limit. It looks generous and it guarantees an OOM-kill. Encode this in the game definition defaults so no customer can trip over it.
- **Platform bug?**: **Checked — NO.** The panel does not set `-Xmx` to the container limit. `SERVER_MEMORY` (which feeds `-Xmx`) is a read-only, system-managed variable set to `jvmHeapMb(server.memoryMb)` = allocation − 15% headroom, clamped to a 512 MB–2048 MB reserve (`apps/panel-api/src/servers/server-memory.util.ts`; applied in `nodes.service.ts` where the var is not user-editable). So every Java server already boots with ~15% headroom below its container cap — the container-OOM-kill trap is handled at the platform level, not per customer.
  - **Real improvement opportunity (not a bug):** the Minecraft template starts with `-Xms128M -Xmx{{SERVER_MEMORY}}M` and no G1GC tuning (`database/seed/templates/minecraft.json`). Class C best practice for *modded* servers is `-Xms == -Xmx` plus Aikar's G1GC flag set. Adopting those in the modded Minecraft templates would be a platform-wide win — file it as template work, don't hand-tune one customer.
- **Tutorial written?**: no ← very high-value. "Minecraft server out of memory" is a huge search term and almost every existing page gives the wrong advice (just raise Xmx). refx.gg can honestly explain the heap-vs-container distinction *and* point at its automatic headroom.

### Create: Steam 'n' Rails registry mismatch on join

- **Game / stack**: Minecraft, Forge, Medieval MC (MMC4)
- **Class**: D — runs, clients can't join
- **Searchable error string**: canonical signature — `Missing registry entries` / registry-remapping mismatch referencing the Steam 'n' Rails mod id `railways:` (e.g. `railways:...`). TODO(frank): paste the exact client-side disconnect line — it enumerates the missing entries and their mod IDs, which names the diverging mod.
- **Symptom**: Server boots and runs fine. Client connects, then is immediately disconnected with a registry/missing-entries error.
- **Root cause**: Client and server mod sets diverged — the server's Create: Steam 'n' Rails version registered entries the client didn't have (or vice versa). Typically triggered by a mod being updated on one side only.
- **Fix**: Bring both sides to identical mod versions. Ship the exact client pack matching the server, and verify the versions rather than trusting "I reinstalled it".
- **Prevention**: Pin the pack version server-side and publish the matching client pack. Any server-side mod change must ship a client pack update at the same time — otherwise every player breaks at once.
- **Platform bug?**: no — but a **product opportunity**: the panel could surface the server's exact mod manifest for customers to hand to their players. That would prevent a large fraction of "can't connect" tickets across every modded game. TODO(frank): worth considering.
- **Tutorial written?**: no ← strong candidate; this error class is very common across all modded Minecraft hosting.

### Arma 3 launcher blamed "steamclient.so / crash before init" for every mid-run death

- **Game / stack**: Arma 3, Linux Docker node (refx egg launcher)
- **Class**: A/C — the *diagnostic* misled; the underlying crash class varies
- **Searchable error string**: `no .rpt written — crash was before Arma init` … `A code 139 here = missing/incompatible steamclient.so`
- **Symptom**: Server runs healthily for minutes/hours (e.g. Antistasi mission fully initialised, headless clients connected), then dies — and the console's final line claims the crash happened "before Arma init" and hints at steamclient.so. Customers chase the wrong fix.
- **Root cause**: The launcher's exit diagnostic keyed on "no `.rpt` file found". On Linux, Arma logs to stdout and frequently never writes an `.rpt` at all, so the no-rpt branch fired after *every* crash regardless of uptime, printing a startup-crash hint written for instant deaths. A container OOM kill (the likeliest cause of a silent mid-mission death with headless clients — each HC loads the full mod set) produced no memory error anywhere, so the misleading hint was all the customer saw.
- **Fix**: Launcher rewrite (egg `database/seed/templates/arma3.json`): reads the cgroup `oom_kill` counter (v2 `memory.events`, v1 `memory.oom_control`) before launch and after exit and prints a definitive OUT OF MEMORY verdict when it rose; otherwise explains exit 137 (SIGKILL/RAM) and 139 (segfault, with the steamclient.so hint only when uptime < 30s); the no-rpt message is now uptime-aware ("Linux server logs to the console output above").
- **Prevention**: Exit diagnostics must be evidence-keyed (exit code, uptime, cgroup counters), never inferred from a missing file that legitimately doesn't exist on this platform.
- **Platform bug?**: yes — fixed fleet-wide via the egg (update-panel.sh re-seed + server Update to regenerate refx-run.sh).
- **Tutorial written?**: no ← candidate: "Arma 3 server crashes after headless clients connect" is a searchable symptom, and the honest OOM explanation (HCs multiply the mod-set RAM cost) isn't written up anywhere.

---

## Patterns worth noticing

Three incidents, and two of them are the same underlying disease: **version skew between client, server, mods, and loader.** That's not a coincidence — it is *the* dominant failure mode of modded game hosting.

That suggests two things worth more than any individual fix:

1. Any feature that pins and surfaces exact mod manifests removes a whole category of tickets.
2. Any customer-facing doc that explains version pinning prevents them before they're filed.

Both are platform work, not support work. Note them; don't lose them in the ticket queue.
