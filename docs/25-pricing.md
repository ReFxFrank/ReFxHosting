# 25 — Pricing basis (how tiers are priced)

The durable, repeatable basis for pricing game-server tiers so every plan makes
money — and stays consistent as you add games and nodes. This is the source of
truth; update it whenever the rate or cost basis changes.

## The model

- Each game is a **HARDWARE_TIER** product with **Low / Mid / High** tiers, sized
  at **0.5× / 1× / 2×** the game's *recommended* RAM (set per egg in
  `database/seed/templates/*.json` as `recMemoryMb`).
- **RAM is the binding constraint** for game servers, so price is driven by it:

  ```
  monthly price = tier RAM (GB) × RATE_PER_GB
  ```

- Longer billing terms auto-discount on a fixed curve (weekly/biweekly ∝ days,
  quarterly −10%, semi-annual −15%, annual −20%/mo).
- CPU and disk are folded into the rate (they're not the bottleneck). Revisit
  only if a node is genuinely CPU- or disk-bound.

## Current rate

**`RATE_PER_GB = $6.00 / GB / month (USD)`** — stored as `PRICE_PER_GB_CENTS = 600`
in `database/seed/seed.ts` (override per-deploy with `SEED_PRICE_PER_GB_CENTS`).

Chosen as **~2.75× blended hardware cost** (see below): healthy margin, profitable
on every node, and competitive enough to actually fill nodes. (Strict 4× landed at
~$8.70/GB — above typical game-host pricing — so we priced for occupancy.)

## Cost basis (snapshot — keep current)

| Node | CPU | RAM | Cost/mo | $/GB |
|------|-----|-----|---------|------|
| `refx-ca-east-bhs` | Ryzen 9800X3D (premium) | 64 GB | $179 | **$2.80** |
| `refx-ca-east-bhs1` | Ryzen 9700X | 64 GB | $85 | **$1.33** |
| panel control box | — | — | $14.50 | shared overhead |
| **Total** | | **128 GB** | **$278.50** | **$2.18 blended** |

Margin at $6/GB, conservative **1:1** (no overcommit), fully sold:

- Revenue 128 GB × $6 = **$768/mo** → cost $278.50 → **~$490/mo profit (~2.75×, ~64% gross)**.
- Worst-case node (`bhs`, $2.80/GB): $6 still = **2.1×** — profitable everywhere.
- Any RAM **overcommit** you run (1.5–2× is normal for game hosting) is pure
  upside not baked into the price, so you stay safe at full face-value sell-out.

## Billing durations & margin (every term stays profitable)

Longer terms discount, but never below cost. Effective **$/GB** and margin vs the
**most expensive** node ($2.80/GB) and the **blended** cost ($2.18/GB):

| Term | Discount | Effective $/GB | × worst node | × blended |
|------|----------|----------------|--------------|-----------|
| Weekly / Biweekly | none (pro-rated) | $6.00 | 2.14× | 2.75× |
| Monthly | — | $6.00 | 2.14× | 2.75× |
| Quarterly | −10% | $5.40 | 1.93× | 2.48× |
| Semi-annual | −15% | $5.10 | 1.82× | 2.34× |
| **Annual** | **−20%** | **$4.80** | **1.71×** | **2.20×** |

So even the deepest term (annual) earns **1.71× on the priciest node** and **2.2×
blended** — profitable everywhere. The reprice script writes all six terms from
this curve, so they stay in lock-step with the monthly base automatically. Weekly/
biweekly are pro-rated (same per-day rate as monthly), not discounted.

> Display note: the storefront "from $X/mo" and tier cards show the **monthly**
> price (`storefront.service.startingPrice` + `monthlyPrice()` in
> `game-detail.tsx`). The customer picks the actual term at checkout, which
> charges that term's stored price.

## Per-game prices @ $6/GB (monthly)

| Recommended RAM → games | Low (0.5×) | Mid ⭐ (1×) | High (2×) |
|---|---|---|---|
| **2 GB** — Terraria, TF2, Unturned, ATS | 1 GB → $6 | 2 GB → $12 | 4 GB → $24 |
| **3 GB** — CS2, Killing Floor 2, Astroneer, tModLoader | 1.5 GB → $9 | 3 GB → $18 | 6 GB → $36 |
| **4 GB** — Minecraft, Paper, Fabric, Valheim, Garry's Mod, Project Zomboid, Arma 3, Mordhau | 2 GB → $12 | 4 GB → $24 | 8 GB → $48 |
| **6 GB** — MC Forge/NeoForge, FiveM, 7 Days to Die, V Rising | 3 GB → $18 | 6 GB → $36 | 12 GB → $72 |
| **8 GB** — Rust, DayZ, Conan Exiles, Enshrouded, Arma Reforger, Squad, Satisfactory | 4 GB → $24 | 8 GB → $48 | 16 GB → $96 |
| **12 GB** — ARK, Palworld | 6 GB → $36 | 12 GB → $72 | 24 GB → $144 |

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

_Last updated: 2026-06-30. Rate: $6/GB/mo USD. Keep the cost-basis table current._

> **2026-06-30 right-sizing.** Recommended RAM was recalibrated against what each
> title actually uses in practice (not the publishers' generous headline numbers),
> trimming over-provisioned eggs so their **Low** tier still boots comfortably:
> ARK & Palworld 16→12 GB, Satisfactory & Conan Exiles 12→8 GB, Arma 3 / Mordhau /
> Project Zomboid 6→4 GB, CS2 & Killing Floor 2 4→3 GB. Games whose RAM is a genuine
> floor (Rust, DayZ, Squad, Enshrouded, V Rising, 7DtD, modded MC, FiveM) were left
> as-is. Run `npm run db:resync-tiers -- --apply` after deploy to move existing tiers.
