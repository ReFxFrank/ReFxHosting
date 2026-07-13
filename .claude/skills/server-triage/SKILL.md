---
name: server-triage
description: Diagnose a failing game server from logs: boot failures, mixin crashes, OOM, registry mismatches, lag, disconnects. Use for ANY refx.gg support ticket, crash log, or server that won't start.
---

# Game Server Triage

The goal is a diagnosis you can point at a log line for, not a plausible-sounding guess. A wrong-but-confident answer costs a customer two hours and then they leave.

## Guardrails

- **Never state a root cause without quoting the exact log line it rests on.** If you can't quote it, you don't have a diagnosis — you have a hypothesis, and you should say so in those words.
- **Read the log from the first error, not the last.** The final exception is usually downstream noise from the real failure that happened 400 lines earlier. This single habit fixes most misdiagnoses.
- **Never recommend deleting a world, config, or mod folder without confirming a restorable backup exists.** Not "a backup exists" — a backup you have confirmed restores. Data loss is the one mistake a customer never forgives.
- **Never set `-Xmx` equal to or above the container's memory limit.** See the OOM section; this causes the exact problem it looks like it should fix.
- **Never blame "too many mods."** Name the mod and the line, or keep looking.
- **Never paste customer IPs, tokens, credentials, or personal data into an external search or tool.** Redact before searching an error string.
- **Escalate, don't tinker, when the symptom is node-level.** If several customers on one node are failing, the problem is not their configs. Stop touching individual servers and tell Frank.
- **If the fix requires a platform change** (image, game definition, panel, proxy), write the internal note. Do not hand the customer a workaround that hides a bug you'll then hit 50 more times.

## Step 1 — Intake

Do not start diagnosing without these. Guessing at missing facts is how you end up debugging the wrong server.

- Game, version, and modloader version
- Modpack/plugin list + versions (or "vanilla")
- **The full log**, not the last 20 lines — and the crash report file if the game writes one
- What changed immediately before it broke (mod added, version updated, setting changed, "nothing" — "nothing" is usually a game or mod auto-update)
- When it started, and whether it's constant or intermittent
- RAM allocation vs plan limit
- Player count at the time of failure
- Is this one server, or several on the same node?

If the customer hasn't given you the log, ask for the log. Everything else is theatre.

## Step 2 — Classify

Match the symptom to one class, then follow that class. If two seem to fit, the earliest-firing one is usually the cause and the other is a consequence.

| Class | Signature |
|---|---|
| A | Exits immediately, no stack trace |
| B | Crash with a stack trace (mod / mixin / plugin) |
| C | Out of memory |
| D | Server runs, clients can't join |
| E | Runs, but lags — low TPS / high MSPT |
| F | Intermittent disconnects, timeouts, packet loss |
| G | World corruption / data loss |
| H | Multiple servers on one node → **escalate** |

## A — Won't start, no stack trace

Usually environment, not code. Check in this order:

1. **Container exit code.** `137` = OOM-killed by the cgroup, not a game problem → go to class C. `1` = the process chose to exit; read its last output. `0` = it thinks it finished — check the startup command.
2. **Startup command** — did a config change break the arguments? Is it pointing at a jar/binary that doesn't exist after an update?
3. **Port conflict** — allocation collided, or the game hardcoded a port.
4. **EULA / licence acceptance** flag not set (Minecraft's `eula.txt` is the classic, and the log says so plainly).
5. **Corrupt or half-written config** — a truncated `.properties`/`.ini` after a disk-full event.
6. **Disk full.** Check quota before anything clever. It presents as a dozen unrelated errors.
7. **Failed/partial install** — binary missing, SteamCMD depot download interrupted.

## B — Crash with a stack trace

**Read the first exception.** Then:

- **Mixin failures** (`Mixin apply failed`, `InvalidInjectionException`, `MixinApplyError`): the mixin class name contains the offending mod's package. That names the mod for you — you don't have to bisect. Cause is almost always a version mismatch: the mod's mixin targets a class shape from a different modloader/game version, or two mods patch the same target.
  - Fix by aligning versions (mod ↔ modloader ↔ game), not by deleting mods at random.
  - Example from our own history: `MekanismEnchantableMekaSuit` — see `references/known-issues.md`.
- **`NoSuchMethodError` / `NoClassDefFoundError` / `ClassNotFoundException`**: a mod is compiled against a version of another mod or the loader that isn't installed. Version skew. The missing symbol names the library.
- **Missing dependency**: the loader usually says so explicitly, in a readable box. Read it.
- **Plugin (Bukkit/Spigot/Paper) stack traces**: the plugin name is in the trace. Check it against the server version — plugins built for an older API break silently across major versions.

If, and only if, the trace genuinely doesn't name a culprit: binary-search the mod list (halve, boot, repeat). Say explicitly that you're bisecting because the trace was inconclusive — don't present it as the first resort.

## C — Out of memory

**First, distinguish the two failures. They look similar and have opposite fixes.**

| | Java heap exhaustion | Container OOM-kill |
|---|---|---|
| Evidence | `java.lang.OutOfMemoryError: Java heap space` in the log, with a stack trace | No Java error at all; process vanishes; **exit code 137** |
| What happened | The JVM ran out of *heap* | The kernel killed the process for exceeding the *container* limit |
| Fix direction | Raise `-Xmx` (if there's room) or fix the leak | **Lower** `-Xmx`, or raise the plan |

The trap: the JVM uses more memory than its heap. Metaspace, thread stacks, GC structures, direct/off-heap buffers, and the JIT all live outside `-Xmx`. So a server with a 4 GB container and `-Xmx4G` will be OOM-killed while never once reporting a Java heap error — because it never exhausted the heap, it exhausted the container.

**Rule: leave headroom.** `-Xmx` ≈ container limit minus ~1–1.5 GB for a modded Minecraft server (roughly 75–85% of the limit). Set `-Xms` equal to `-Xmx` on a dedicated container so the heap doesn't thrash while growing.

Then ask whether it's undersizing or a leak:

- Steadily climbing heap, full GCs getting longer, OOM after hours → **leak or accumulation** (chunk loading, entity/tile-entity accumulation, a mod hoarding). Raising RAM only buys time.
- OOM at a predictable moment (world load, N players joining, a big mod pack booting) → **genuinely undersized**. More RAM is the right answer.

For modded Minecraft specifically, use G1GC with tuned flags (Aikar's set is the accepted baseline). Don't cargo-cult those flags onto non-Java games — they do nothing.

## D — Runs, but clients can't join

Split the symptom precisely. This distinction does 80% of the work:

- **Client can't reach the server at all** (times out, "connection refused", not in browser) → network layer: port allocation, firewall, proxy/DDoS path, wrong address given to the customer, server bound to the wrong interface.
- **Client connects, then is rejected** → application layer:
  - **Registry / "missing registry entries" / mod mismatch**: the client's mod set doesn't match the server's. Classic cause: mods added, removed, or *updated* server-side without the customer redistributing the matching client pack. The log lists the missing entries and their mod IDs — that names the mod.
    - Fix: pin the pack version, ship the exact client pack, verify both sides run identical mod versions. "Just reinstall the pack" without pinning the version reproduces the bug next week.
    - Example from our own history: Create: Steam 'n' Rails — see `references/known-issues.md`.
  - **Protocol/version mismatch**: client and server on different game versions.
  - **Whitelist / auth / online-mode**: says so in the log, plainly.
  - **Full server / slot limit.**

Ask the customer for *their* client-side error text. It is usually more diagnostic than the server log, and people forget to send it.

## E — Lag / low TPS

**Profile, don't guess.** For Minecraft, install Spark and take a profile (`/spark profiler`). Anything else is superstition, and telling a customer to "remove mods" without evidence destroys trust.

- Look at **MSPT**, not just TPS. TPS 20 with MSPT 45 means you're one player away from a problem.
- Common real causes, in rough order: chunk generation (new world exploration), entity/tile-entity accumulation (mob farms, item stacking), hopper/redstone chains, worldgen-heavy mods, unoptimised mod ticking, **GC pauses** (→ that's actually class C, go fix the heap).
- Distinguish server lag (low TPS/high MSPT) from network lag (fine TPS, high ping) — customers report both as "lag" and the fixes are unrelated.

## F — Intermittent disconnects / timeouts

- Is it one player or all players? One player = their network. All players simultaneously = the server, node, or edge.
- Correlate with GC pauses (a 10-second stop-the-world will time clients out — again, class C).
- Check the DDoS/proxy path and any keepalive/timeout settings on the edge.
- Check for an actual attack. If several servers on the node hiccup together → class H, escalate.

## G — World corruption

1. **Stop the server immediately.** Every second it runs it can write more corruption over recoverable data.
2. **Snapshot the current state before touching anything**, even the corrupted state. You may need it.
3. Restore from the most recent backup that predates the corruption.
4. Then find the cause — a SIGKILL instead of a graceful stop, disk-full during a save, a crash mid-write, a mod writing bad chunk data. If it was a SIGKILL from our stack, that is a **platform bug** and it goes in the internal note, because it will happen to everyone else too.

## H — Node-level

Signals: several unrelated customers on one node failing at once; host-level resource exhaustion; disk errors; network anomalies across servers.

**Stop diagnosing individual servers.** Escalate to Frank with the list of affected servers, the node, and the timestamp. Tuning one customer's `-Xmx` while the node's disk is dying wastes everyone's time.

## Step 3 — Output

Produce **two** artefacts, always.

**1. Customer reply** — plain language, no jargon dumps, no stack traces pasted back at them:

```
What's happening: <one sentence, no jargon>
Why: <one or two sentences, honest>
Fix: <numbered steps they can actually perform, or "I've fixed this for you">
To stop it recurring: <the actual prevention>
```

If you're not certain, say so and say what you need. "I think X, and I can confirm it if you send me Y" beats a confident wrong answer every single time.

**2. Internal note**:

```
Server / node:
Class:
Root cause (with the log line):
Fix applied:
Platform bug? (yes/no — if yes, what needs to change and where)
Novel? (yes → append to references/known-issues.md)
```

## Step 4 — Feed the loop

If the issue is novel, **append it to `references/known-issues.md`** in the entry format that file specifies. Two things happen when you do:

1. The next occurrence is a 30-second lookup instead of an hour of log reading.
2. It becomes a tutorial page — someone is Googling that exact error string right now, and a page that actually fixes it is the cheapest SEO refx.gg will ever get. Hand it to `refx-seo-page`.
