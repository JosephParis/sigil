---
id: 38
title: "No shareable run seeds: two players can never play the same dungeon"
priority: P2
area: product
effort: L
status: open
---

## Problem

Joey wants each run to have a seed a player can share, so a friend can play the
same dungeon and the two can compare how they did. Nothing like that exists.

The name suggests otherwise, so to be clear: **`runSeed` is not a game seed.**
It is an 8-character id minted with `Math.random()` at run start
(`logic/lifecycle.js:116`) and used only as a dedupe and claim key
(`utils/historyStore.js:49`, `api/_lib/merge.js:57`, `api/claim.js:77`). It
does not feed the shuffle, and replaying it reproduces nothing.

What the code does have is the plumbing a real seed would need. The rules
engine takes its randomness as a parameter rather than calling `Math.random`
directly — `createRun(rng, …)` (`lifecycle.js:19`), `shuffle(arr, rng)`
(`deck.js:49`), `makeBossCard(id, rng)` (`bosses.js:96`), the monster traits
(`deck.js:118`), and `state.rng` inside combat and the sanctuary
(`combat.js:327,340,390`, `lifecycle.js:205,217,457`, `sanctuary.js:175`). The
unit tests already exploit it: `seededRng` in `test/support/state.js:14` is a
mulberry32 that makes a shuffle or a Forge roll reproducible.

The app never passes anything but `Math.random`:

- `index.jsx:185`, `:481`, `:491` — every new run, tutorial or not
- `components/modals.jsx:464,466` — the Forge rolls its grants with
  `Math.random`, bypassing `state.rng` altogether
- `index.jsx:102` — loading a save replaces `rng` with a fresh `Math.random`,
  and `saveGame` strips it (`index.jsx:142`). So even a seeded run would stop
  being reproducible at the first reload, which on mobile is every tab switch
  the OS decides to evict.

The design docs have wanted this from the start and say so: `DESIGN.md:273`
(Daily Seed, listed under "never built") and `docs/EXTENSIONS.md:144`
(Daily Coffin, Weekly Pilgrimage, Mirror Run — "optional sharing of the seed
string for friends to attempt").

## Why one shared stream is not enough

Threading a single seeded `rng` through `state.rng` would make a run
reproducible only for a player who makes *identical* choices. Combat draws from
the stream in response to what the player does (`combat.js:327` inserts a card
at a random depth, `:390` rerolls a rank), so the first different decision
shifts every later roll and the two players are in different dungeons by
descent 2. That defeats the point: comparing two people's choices on the same
dungeon.

So the seed has to be split by purpose and position, not consumed as one
sequence. Derive an independent stream for each thing that should match —
for example `hash(seed, descent, 'deck')`, `hash(seed, descent, 'theme')`,
`hash(seed, sigil, 'boons')`, `hash(seed, sigil, 'forge')` — and keep
choice-driven rolls (mid-combat inserts and rerolls) on their own stream so they
cannot shift the shared ones.

Things that legitimately differ per player and must be pinned or folded into
the seed, or two "same seed" runs silently diverge:

- **Feature flags** (`flags.js:16`). `bosses`, `specialMonsters`, `wounds` and
  `customCards` all change the deck or the offers, and `?flag-<id>` URL params
  override them per device.
- **The Boon library** (`library` flag). With it on, each player's unlocked set
  differs, so Boon offers differ. Draw offers from the full pool on a seeded
  run, or record the unlocked set in the seed.
- **Mode and ascension** — Hardcore, Quiet Run, the A-level.
- **`GAME_VERSION`** — a balance change means the same seed is a different
  dungeon. A seed from 0.4 should say it is from 0.4, and the game should say
  so rather than quietly play it under 0.5.
- **The tutorial**, which is curated and should not be seedable at all.

## Why it matters for batch 1

It is a strong fit for a Reddit playtest: "here is my seed, beat my time" is a
reason to post a comment and a reason for a second person to start a run. It
also turns qualitative feedback into something comparable — two players who
died on the same descent of the same seed are talking about the same rooms.

It is **not** a blocker, and it collides with issue 11: batch 1 was decided to
play exactly what 0.4 shipped so leaderboard results stay comparable. A seeded
run is a different kind of run. Either it ships behind a `seeds` flag that
stays off for batch 1, or it ships into batch 1 on purpose and the leaderboard
learns to tell seeded runs apart. That is Joey's call; see "Decide first".

## Suggested fix

1. **One seeded PRNG module** in `src/games/scoundrel/` — promote the
   mulberry32 already in `test/support/state.js` and add a small string hash
   to derive sub-streams. Save the seed (and any stream positions that need
   to survive) in the save, so `loadSavedGame` rebuilds the same streams
   instead of substituting `Math.random`.
2. **Route every gameplay roll through it**: run creation, descent decks,
   theme and Trial choice, Boon offers, the Forge (fix `modals.jsx:464,466`
   to use the run's stream), boss creation, monster traits, and the
   discovery unlock (`lifecycle.js:457`). Cosmetic randomness — the run
   record id (`history.js:108`), the assigned name — stays on `Math.random`;
   say so in a comment at each call so the next reader does not "fix" it.
3. **A seed a person can type.** A short code, case-insensitive, no
   ambiguous characters (no `0/O`, `1/l/I`), e.g. 8 characters from a
   Crockford-style alphabet. It should embed or imply the version and rules
   it was played under, or carry them alongside it in the share link.
4. **UI**: show the seed on the run screen and the game-over/victory screen
   with a copy button; an "Enter a seed" option on the opening screen; and a
   `?seed=<code>` link that starts that run (note this joins the existing
   `?flag-<id>` URL handling, which already takes precedence over storage).
5. **Record it.** Put the seed in `buildRunRecord` (`history.js`) and, if the
   leaderboard is going to filter on it, give `runs` a `seed` column with a
   migration in `ensureRunsTable()` — the same pattern `game_version` and
   `dev` followed (`db/schema.sql`). Keep it distinct from `runSeed`, which
   is a dedupe key and must keep its current meaning.
6. **Leaderboard (optional, can follow)**: a per-seed view in
   `api/leaderboard.js` — best runs on this seed — so the comparison is in
   the game rather than in a Reddit thread.

## Decide first (Joey)

- **Batch 1 or after?** Behind a `seeds` flag defaulting off (issue 11's
  defaults untouched), or live for the playtest as a deliberate feature.
- **Do seeded runs count on the main leaderboard?** A player can replay a
  seed they already know; the main board probably should exclude them or mark
  them, the way it already excludes `dev` runs.
- **Same choices offered, or same dungeon only?** Seeding Boon and Forge offers
  makes the comparison purest. The Mirror Run idea in `EXTENSIONS.md` instead
  keeps the dungeon and varies the offers. Pick one for v1.
- **Daily seed** is a natural follow-up (seed = the date) but is out of scope
  here; this issue is the player-chosen, shareable seed it would build on.

## Acceptance criteria

- [ ] A unit test plays the same seed twice under the same flags and version
      and gets identical decks, themes, Trials, Boon offers and Forge grants
      for every descent.
- [ ] A unit test plays the same seed twice with **different player choices**
      (e.g. take a different Boon at sigil 1) and still gets the same descent
      decks and themes at sigils 2–3.
- [ ] A run saved and reloaded mid-descent produces the same remaining
      dungeon as one played straight through (Playwright, or a unit test over
      `saveGame`/`loadSavedGame`).
- [ ] No gameplay roll in `src/games/scoundrel` calls `Math.random` directly;
      the remaining cosmetic call sites are commented as such.
- [ ] The seed is visible during and after a run, copyable, enterable from
      the opening screen, and `?seed=` starts that run.
- [ ] A seed entered under a different `GAME_VERSION` or flag set is either
      honoured exactly or refused with a message — never silently played as a
      different dungeon.
- [ ] The tutorial cannot be seeded.
- [ ] The seed is stored on the run record; `runSeed` keeps its current
      meaning and every dedupe test still passes.
- [ ] `DESIGN.md` §7 and `EXTENSIONS.md` §8 updated to say what shipped;
      `test/designDocs.test.js` still green.
- [ ] `npm run lint && npm run build && npm run test` green.
