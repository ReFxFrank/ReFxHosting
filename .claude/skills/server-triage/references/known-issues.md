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

These come from real incidents on the Medieval MC (MMC4) server. **TODO(frank): paste the exact log lines from your logs into the "searchable error string" fields** — the precise string is what makes this file findable later, and it's the exact query a customer will type into Google.

### Mekanism MekaSuit mixin crash on boot

- **Game / stack**: Minecraft, Forge, Medieval MC (MMC4)
- **Class**: B — crash with stack trace
- **Searchable error string**: TODO(frank) — paste the `Mixin apply failed` / `InvalidInjectionException` line referencing `MekanismEnchantableMekaSuit`
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
- **Platform bug?**: **Worth checking.** TODO(frank): if the default `-Xmx` in the Minecraft game definition equals the plan's RAM limit, that's a platform bug affecting every modded customer, not a one-off.
- **Tutorial written?**: no ← very high-value. "Minecraft server out of memory" is a huge search term and almost every existing page gives the wrong advice (just raise Xmx).

### Create: Steam 'n' Rails registry mismatch on join

- **Game / stack**: Minecraft, Forge, Medieval MC (MMC4)
- **Class**: D — runs, clients can't join
- **Searchable error string**: TODO(frank) — paste the "missing registry entries" / registry-mismatch disconnect line
- **Symptom**: Server boots and runs fine. Client connects, then is immediately disconnected with a registry/missing-entries error.
- **Root cause**: Client and server mod sets diverged — the server's Create: Steam 'n' Rails version registered entries the client didn't have (or vice versa). Typically triggered by a mod being updated on one side only.
- **Fix**: Bring both sides to identical mod versions. Ship the exact client pack matching the server, and verify the versions rather than trusting "I reinstalled it".
- **Prevention**: Pin the pack version server-side and publish the matching client pack. Any server-side mod change must ship a client pack update at the same time — otherwise every player breaks at once.
- **Platform bug?**: no — but a **product opportunity**: the panel could surface the server's exact mod manifest for customers to hand to their players. That would prevent a large fraction of "can't connect" tickets across every modded game. TODO(frank): worth considering.
- **Tutorial written?**: no ← strong candidate; this error class is very common across all modded Minecraft hosting.

---

## Patterns worth noticing

Three incidents, and two of them are the same underlying disease: **version skew between client, server, mods, and loader.** That's not a coincidence — it is *the* dominant failure mode of modded game hosting.

That suggests two things worth more than any individual fix:

1. Any feature that pins and surfaces exact mod manifests removes a whole category of tickets.
2. Any customer-facing doc that explains version pinning prevents them before they're filed.

Both are platform work, not support work. Note them; don't lose them in the ticket queue.
