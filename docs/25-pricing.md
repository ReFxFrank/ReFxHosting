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

## Per-game prices @ $6/GB (monthly)

| Recommended RAM → games | Low (0.5×) | Mid ⭐ (1×) | High (2×) |
|---|---|---|---|
| **2 GB** — Terraria, TF2 | 1 GB → $6 | 2 GB → $12 | 4 GB → $24 |
| **4 GB** — Minecraft, Paper, Fabric, CS2, Valheim, Garry's Mod, Killing Floor 2, Astroneer, Unturned, ATS | 2 GB → $12 | 4 GB → $24 | 8 GB → $48 |
| **6 GB** — MC Forge/NeoForge, FiveM, Project Zomboid, 7 Days to Die, Arma 3, Mordhau, V Rising | 3 GB → $18 | 6 GB → $36 | 12 GB → $72 |
| **8 GB** — Rust, DayZ, Conan Exiles, Enshrouded, Arma Reforger, Squad | 4 GB → $24 | 8 GB → $48 | 16 GB → $96 |
| **12 GB** — ARK, Satisfactory | 6 GB → $36 | 12 GB → $72 | 24 GB → $144 |
| **16 GB** — Palworld | 8 GB → $48 | 16 GB → $96 | 32 GB → $192 |

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

In the running stack (prod), via the migrate image:

```bash
infra/scripts/dc run --rm --entrypoint sh migrate -c \
  "cd /repo && npx ts-node --transpile-only --project /repo/tsconfig.seed.json database/seed/reprice.ts --apply"
```

Individual tiers can always be hand-tuned in **Admin → Products → (game) →
Hardware tiers** afterwards; the reprice script and seed won't fight those unless
you re-run reprice with `--apply`.

---

_Last updated: 2026-06-26. Rate: $6/GB/mo USD. Keep the cost-basis table current._
