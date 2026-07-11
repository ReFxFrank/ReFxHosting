# 25 — Pricing basis (how tiers are priced)

The durable, repeatable basis for pricing game-server tiers so every plan makes
money — and stays consistent as you add games and nodes. This is the source of
truth; update it whenever the rate or cost basis changes.

## The model

- Each game is a **HARDWARE_TIER** product with **Low / Mid / High** tiers, sized
  at **0.5× / 1× / 2×** the game's *recommended* RAM (set per egg in
  `database/seed/templates/*.json` as `recMemoryMb`), **capped at 14 GB / tier**
  (`MAX_TIER_MEMORY_MB`) so the High tier can't exceed **$70/mo** — past that,
  player-capped games can't use the RAM and no host sells those packages.
- **RAM is the binding constraint** for game servers, so price is driven by it:

  ```
  monthly price = tier RAM (GB) × RATE_PER_GB
  ```

- Longer billing terms auto-discount on a fixed curve (weekly/biweekly ∝ days,
  quarterly −10%, semi-annual −15%, annual −20%/mo).
- CPU and disk are folded into the rate (they're not the bottleneck). Revisit
  only if a node is genuinely CPU- or disk-bound.

## Current rate

**`RATE_PER_GB = $5.00 / GB / month (USD)`** — stored as `PRICE_PER_GB_CENTS = 500`
in `database/seed/seed.ts` (override per-deploy with `SEED_PRICE_PER_GB_CENTS`).

Chosen as **~2.3× blended hardware cost** (see below): healthy margin, profitable
on every node, and priced to sit at the **top of the premium, no-overcommit band**
of the market rather than chase budget hosts. A 2026 competitor sweep (~15 hosts)
found RAM-priced hosts cluster at **$2.65–3/GB** when they oversell RAM, and
**$5–6/GB** when they sell honest, dedicated RAM (Nodecraft Pro ~$5/GB, GGServers
Premium $6/GB). At $5/GB with **no overcommit**, our RAM is genuinely dedicated —
we match the premium-tier rate while the headline still drops ~17% from the old
$6/GB. (Floor: the guardrail below keeps us ≥ 1.5× the priciest node, i.e. ≥ $4.20;
drop `PRICE_PER_GB_CENTS` toward 450 if you want to undercut more aggressively.)

Note the "no overcommit" claim is about **RAM** — that stays 1:1 dedicated.
**CPU** is deliberately different: plans sell fair-share vCPU with burst to 2×
(see the CPU model in [06 — Node Agent](06-node-agent.md)), and nodes default
to 2× CPU overcommit, which is what makes the burst headroom sustainable.

## Cost basis (snapshot — keep current)

| Node | CPU | RAM | Cost/mo | $/GB |
|------|-----|-----|---------|------|
| `refx-ca-east-bhs` | Ryzen 9800X3D (premium) | 64 GB | $179 | **$2.80** |
| `refx-ca-east-bhs1` | Ryzen 9700X | 64 GB | $85 | **$1.33** |
| panel control box | — | — | $14.50 | shared overhead |
| **Total** | | **128 GB** | **$278.50** | **$2.18 blended** |

Margin at $5/GB, conservative **1:1** (no overcommit), fully sold:

- Revenue 128 GB × $5 = **$640/mo** → cost $278.50 → **~$361/mo profit (~2.30×, ~57% gross)**.
- Worst-case node (`bhs`, $2.80/GB): $5 still = **1.79×** — profitable everywhere.
- Any RAM **overcommit** you run (1.5–2× is normal for game hosting) is pure
  upside not baked into the price, so you stay safe at full face-value sell-out.

## Billing durations & margin (every term stays profitable)

Longer terms discount, but never below cost. Effective **$/GB** and margin vs the
**most expensive** node ($2.80/GB) and the **blended** cost ($2.18/GB):

| Term | Discount | Effective $/GB | × worst node | × blended |
|------|----------|----------------|--------------|-----------|
| Weekly / Biweekly | none (pro-rated) | $5.00 | 1.79× | 2.29× |
| Monthly | — | $5.00 | 1.79× | 2.29× |
| Quarterly | −10% | $4.50 | 1.61× | 2.06× |
| Semi-annual | −15% | $4.25 | 1.52× | 1.95× |
| **Annual** | **−20%** | **$4.00** | **1.43×** | **1.83×** |

So even the deepest term (annual) earns **1.83× blended** and **1.43× on the single
priciest node** — still profitable in every cell, with the worst case being a
full-annual prepay on the premium `bhs` box (~43% gross there; any overcommit erases
even that thinness). The reprice script writes all six terms from this curve, so
they stay in lock-step with the monthly base automatically. Weekly/biweekly are
pro-rated (same per-day rate as monthly), not discounted.

> Display note: the storefront "from $X/mo" and tier cards show the **monthly**
> price (`storefront.service.startingPrice` + `monthlyPrice()` in
> `game-detail.tsx`). The customer picks the actual term at checkout, which
> charges that term's stored price.

## Per-game prices @ $5/GB (monthly)

| Recommended RAM → games | Low (0.5×) | Mid ⭐ (1×) | High (2×, ≤14 GB) |
|---|---|---|---|
| **2 GB** — Terraria, TF2, Unturned, ATS | 1 GB → $5 | 2 GB → $10 | 4 GB → $20 |
| **3 GB** — CS2, Killing Floor 2, Astroneer, tModLoader | 1.5 GB → $7.50 | 3 GB → $15 | 6 GB → $30 |
| **4 GB** — Minecraft, Paper, Fabric, Valheim, Garry's Mod, Project Zomboid, Arma 3, Mordhau, V Rising, 7 Days to Die | 2 GB → $10 | 4 GB → $20 | 8 GB → $40 |
| **6 GB** — MC Forge/NeoForge, FiveM | 3 GB → $15 | 6 GB → $30 | 12 GB → $60 |
| **8 GB** — Rust, DayZ, Conan Exiles, Enshrouded, Arma Reforger, Squad, Satisfactory, Palworld | 4 GB → $20 | 8 GB → $40 | 14 GB → $70 _(capped from 16)_ |
| **12 GB** — ARK | 6 GB → $30 | 12 GB → $60 | 14 GB → $70 _(capped from 24)_ |

_(Voice/TeamSpeak is a separate PER_SLOT product, priced per slot — not on this rate.)_

## Adding a GAME (nothing to price by hand)

1. Drop the egg JSON in `database/seed/templates/` with a sensible `recMemoryMb`.
2. On the next deploy the seeder auto-creates its Low/Mid/High tiers **priced at
   the stored rate**. Done — no manual pricing.

## Adding a NODE (when to move the rate)

1. Add the node's **$/GB** = its monthly cost ÷ physical RAM (GB) to the table above.
2. Recompute the **blended** $/GB.
3. **Guardrail:** keep every node profitable — the rate must stay **≥ 1.5× the most
   expensive node's $/GB**. As long as the priciest node's cost ≤ `RATE_PER_GB / 1.5`,
   you don't need to change anything; cheaper nodes just earn more margin.
4. Only raise `RATE_PER_GB` if a new premium node breaches that guardrail (or you
   want more margin). If you do, update the constant **and** re-run the reprice
   (below) so existing tiers move too.

## Changing prices on the live storefront

The seed is **create-only** (it never overwrites admin-tuned prices), so changing
the rate only affects *new* games. To apply a rate to **existing** tiers, use the
reprice script (safe — dry run by default):

```bash
# Preview every change (no writes):
npm run db:reprice
# or target a specific rate (cents/GB):
npm run db:reprice -- --rate=600

# Apply:
npm run db:reprice -- --apply
```

### Re-sync tier SPECS to the egg (after a recommended-spec change)

`db:reprice` only changes *prices*. If you change an egg's recommended specs
(e.g. ARK 16→12 GB), existing tiers keep their original RAM/CPU/disk (they were
sized when first seeded). To resize the standard Low/Mid/High tiers from the egg's
recommended specs **and** reprice them in one pass:

```bash
npm run db:resync-tiers            # preview
npm run db:resync-tiers -- --apply # apply
```

It recomputes each tier at 0.5×/1×/2× the template's recommended specs (same
formula as the seed) and reprices; custom admin tiers are left untouched. Prod run
mirrors the reprice command via the `migrate` image.

In the running stack (prod), via the migrate image:

```bash
infra/scripts/dc run --rm --entrypoint sh migrate -c \
  "cd /repo && npx ts-node --transpile-only --project /repo/tsconfig.seed.json database/seed/reprice.ts --apply"
```

Individual tiers can always be hand-tuned in **Admin → Products → (game) →
Hardware tiers** afterwards; the reprice script and seed won't fight those unless
you re-run reprice with `--apply`.

---

_Last updated: 2026-06-30. Rate: $5/GB/mo USD. Keep the cost-basis table current._

> **2026-06-30 market recalibration.** Two changes, after a deep competitor sweep
> (~15 hosts: Nitrado, GPortal, Shockbyte, BisectHosting, PingPerfect, Host Havoc,
> GTXGaming, ZAP, Nodecraft, GGServers, Citadel, Scalacube, Survival Servers, …):
>
> 1. **Rate $6 → $5/GB.** The market prices RAM at ~$2.65–3/GB when oversold and
>    ~$5–6/GB when dedicated; $6 sat above even the honest-RAM premium tier. $5/GB
>    keeps us premium-but-fair (no overcommit) and drops every headline ~17%.
> 2. **Right-sized over-provisioned eggs** to what each title actually uses (not
>    publishers' headline numbers), so the **Low** tier still boots comfortably:
>    ARK & Palworld 16→12 GB, Satisfactory & Conan Exiles 12→8 GB, Arma 3 / Mordhau /
>    Project Zomboid / **V Rising / 7 Days to Die** 6→4 GB, CS2 & Killing Floor 2
>    4→3 GB. Genuine-floor games (Rust, DayZ, Squad, Enshrouded, Arma Reforger,
>    modded MC, FiveM) were left as-is.
>
> Combined effect on "from" prices, e.g. ARK $48→$30, Satisfactory/Conan
> $36→$20, V Rising/7DtD $18→$10, Minecraft $12→$10, CS2/KF2 $12→$7.50. Run
> `npm run db:resync-tiers -- --apply` after deploy to move existing tiers onto the
> new rate + specs in one pass.

> **2026-06-30 tier ceiling + Palworld.** A second pass after eyeballing real
> storefronts (e.g. GPortal's *max* Palworld plan — 32 slots, the game's cap — is
> **$36.80/mo**): the old High tier (2× recommended) produced packages nobody buys.
> Two fixes: **(1)** a hard **14 GB / $70 cap** on any tier (`MAX_TIER_MEMORY_MB`),
> so ARK/Palworld High drops 24 GB/$120 → 14 GB/$70 and the 8 GB games' High drops
> 16 GB/$80 → 14 GB/$70 (Low/Mid untouched; modded MC keeps its 8 GB High). **(2)**
> **Palworld 12→8 GB** recommended — it hard-caps at 32 players, so 12 GB Mid ($60)
> overshot a market that tops out ~$37; now Low 4 GB/$20, Mid 8 GB/$40, High 14 GB/
> $70, bracketing GPortal's $17–37 range. Re-run `db:resync-tiers -- --apply`.
