# Launch post drafts

## Posting playbook (do this in order)

Every link below carries a utm tag — the admin **Growth** page
(/admin/growth) will show you signups/revenue per channel within a day of
posting. Before you start: apply the $4/GB reprice if you haven't, and create
a `WELCOME25` coupon (25%, first invoice only) in Admin → Coupons.

1. **Week 1 — tools post** (below) on r/admincraft. Zero selling, builds
   karma. Answer every comment.
2. **Week 2–3 — founder post** (below) on r/admincraft, then your Discord
   announcement.
3. **Ongoing** — drop tool links when they genuinely answer someone's
   question (any Discord/subreddit). Modpack-author + YouTuber outreach
   (template below), a couple per week.
4. **When you have ~5 happy customers** — ask each personally for a
   Trustpilot review.

Tagged links to paste (edit the medium per channel):

- Tools: `https://refx.gg/tools?utm_source=reddit&utm_medium=admincraft`
- Founder post: `https://refx.gg/?utm_source=reddit&utm_medium=founder-post`
- Discord: `https://refx.gg/?utm_source=discord&utm_medium=announcement`
- Outreach: `https://refx.gg/?utm_source=outreach&utm_medium=<creator-name>`

Pricing talking point (July 2026 basis, see docs/25-pricing.md): $4/GB
dedicated RAM — 4 GB Minecraft $16/mo, 8 GB $32/mo, minus 20% on annual.
Comparable volume hosts list ~$3/GB on oversold RAM; the pitch is honest
resources at a fair premium, not the cheapest sticker.

---

## Price-drop email (existing customers — send once after repricing)

**Subject:** Your renewal just got cheaper

**Body:**

Hi {first name},

Quick heads-up: we've dropped our pricing from $5 to $4 per GB of RAM,
and it applies to you automatically — your next renewal will simply be
lower. Nothing to do on your end.

Same dedicated RAM, same burst CPU, same everything. We got more
efficient and the price should reflect that.

If you've been thinking about more memory, upgrades are prorated and
apply instantly from the panel.

— Frank, ReFx Hosting

(PayPal-subscription customers keep their original plan price — PayPal
locks the billing agreement. Mention they can cancel + re-subscribe to
get the new rate if any of them ask.)

---

Copy-paste material for channels only a human should post from. Edit freely —
these are written to sound like the founder, not an ad. **Never post these
from sockpuppet/customer accounts**; both communities ban astroturfing and
they're right to.

---

## r/admincraft (self-post)

**Title:** I built a Minecraft host where switching modpacks doesn't mean
re-setting up your server — looking for honest feedback

**Body:**

Hey r/admincraft — I run game servers for friends and got tired of two things:
reinstalling everything whenever we changed packs, and hosts that hide what
hardware you're actually on. So I built ReFx (refx.gg) and I'd genuinely like
this sub's feedback before I push it harder.

The parts I think are actually different:

- **Game/pack switching keeps the server's identity** — same address, SFTP,
  backups and billing; the panel swaps the template underneath.
- **One-click CurseForge/Modrinth installs that strip client-only mods**
  server-side (no more "clientside only mod" boot loops), pin the right
  loader build, and neutralize packs' own -Xmx overrides.
- **Honest resources:** RAM is dedicated (no oversell), CPU is fair-share
  with burst — published pricing per GB, hardware listed.
- Crash auto-restart, scheduled + offsite backups, live player list, full
  file manager/SFTP. AGPL panel if you want to read the code.

What I'd love feedback on: pricing clarity, what's missing vs whatever you
host on now, and anything that smells like marketing nonsense. I'll be in the
comments. (Mods: I read the self-promo rules — happy to adjust or remove if
this crosses a line.)

---

## Discord announcement (your existing server)

@everyone **Referral program is live** 🎉

Share your personal link (Account → Refer friends) and when a friend gets
their first server, **you both get $5 credit** — credit applies automatically
to renewals, so a few referrals = free month.

Also new this week:
- **Express backups** — offsite storage with resumable full-speed downloads
- **Live player list** on the console
- **Crash auto-restart** on every Minecraft server
- One-click modpack pages: refx.gg/modpacks

Grab your link: <https://refx.gg/account>

---

## Modpack-creator / small YouTuber outreach (DM or email)

Subject: free servers for your pack's community

Hi {name} — I run ReFx Hosting (refx.gg). We host {pack} with a one-click
installer (right loader, client-mods stripped) and have a landing page for it:
refx.gg/modpacks/{slug}.

Offer, no strings: a free server for you to test/record with, and a referral
link that gives your viewers $5 credit and pays the same back to you as
credit. If the page about your pack gets anything wrong, tell me and I'll fix
it same-day.

No obligation to promote anything — worst case you get a free server.

---

## Free-tools post (r/admincraft, r/MinecraftServer, or Discords)

The softest possible intro — you're sharing a utility, not selling. Post this
BEFORE the founder post above if you're new to a community; it builds karma
and goodwill, and the tools pages do the selling quietly.

**Title:** Made a free Minecraft server status checker + RAM calculator —
no signup, no ads

**Body:**

Small weekend-ish project from running my own hosting setup: a set of free
server-owner tools, no account or ads —

- **Status checker** (refx.gg/tools/minecraft-server-status): live
  players/version/MOTD/ping for any Java server. Follows SRV records exactly
  like the vanilla client, so clean domains without a port resolve properly —
  handy for "is it down or is it me."
- **RAM calculator** (refx.gg/tools/minecraft-ram-calculator): honest sizing
  from vanilla to ATM10-class packs. Deliberately conservative because the
  most common support ticket in existence is a 250-mod pack on 2 GB.
- **Aikar's flags generator** (refx.gg/tools/aikars-flags): the canonical
  flags with the correct G1 sizing for your heap, including the 12 GB+
  variant people always miss.
- **SRV record builder** (refx.gg/tools/minecraft-srv-record): registrar
  fields + the raw zone line, for joining via play.yourdomain.com with no
  port.

They run against a hosting panel I build (so yes, there's a company behind
it), but the tools are free for everyone and stay that way — they exist
because I kept needing them in support conversations. Feature requests very
welcome.

---

## Where to submit the site (one-time, ~an hour)

- Google Search Console + Bing Webmaster Tools (done)
- serverlist directories: minecraft-server-list.com's hosting section,
  topminecrafthosting, serverhostingcomparison-type blogs (search "minecraft
  hosting comparison" and email the top authors — many add hosts on request)
- GitHub: the panel is AGPL — a clear README + topics (`minecraft-hosting`,
  `pterodactyl-alternative`) brings organic self-hoster traffic that converts
  into managed customers surprisingly often
