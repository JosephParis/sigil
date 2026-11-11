---
id: 40
title: "What a seed promises is not written down or fully tested"
priority: P2
area: product
effort: S
status: done
branch: issue-40-seed-guarantees
---

## The rule (Joey, 2026-10-14)

Two players on the same seed, under the same rules, get:

1. **The same Trials, whatever they do.** Descent N has the same Trial (and,
   for The Long Night, the same two children) for everyone on the seed, no
   matter which Boons they took, what they forged, or how they played the
   descents before it.
2. **The same run if they do the same things.** Two players who make every
   choice alike, in the sanctuary and in combat, see exactly the same thing at
   every step: the same deck in the same order, the same offers, the same Forge
   grants, the same rolls.

Nothing else is promised. Once two players choose differently, the order of
the deck, the Boon offers that follow from what each one holds, a Wormwood
mute, and the combat rolls may all differ, and that is fine. This is the same
model as Slay the Spire's daily seed: the map and bosses are fixed for
everyone, while the rewards depend on the path each player takes.

"The same rules" means the same `GAME_VERSION`, mode, ascension, and feature
flags. Each of those legitimately changes the Trials:

- Ascension's `themeTierOffset` moves the tier bands.
- A mode's `lockTheme` overrides the roll.
- `specialMonsters` widens the Tier 4 and Tier 5 pools.

## How this came up (read before building)

This came out of a conversation with Joey on 2026-10-14, after issues 38
(seeds) and 39 (challenge links and the seed board) shipped. The next task
should not need that conversation, so here is what it settled.

**Joey's request, in his words:** "the encountered trials should be the same,
and also make sure that if two players do the exact same things then they
should encounter the exact same things. However, outside of that there
shouldn't be any other problems." The last sentence means nothing else has to
match, not that something else needs fixing. Do not widen this into making
the monster order, offers or rolls match across different choices.

**Why this rule.** Joey asked how Slay the Spire's seeds work before deciding.
This is how Slay the Spire 1 does it, read from its code:

- **Fixed by the seed for everyone:**
  - the map;
  - each act's boss, rolled when the act starts;
  - the order of normal and elite fights, built as a list at the start of
    each act, so the Nth fight is the same encounter whichever path led
    there;
  - the order of relics within each rarity, shuffled once at the start.
- **The same only for players who play alike:**
  - card rewards, shops and `?` rooms, which come from long-running streams
    and so shift with every extra room a player takes;
  - inside a fight, monster HP, monster moves and draw order. These come from
    streams that restart each floor from the seed plus the floor number, so a
    fight starts out the same and changes with what the player does.

Sigil's equivalent of "same map and bosses" is the same Trial each descent.
That is what Joey chose to promise.

Sources:

- [Map Generation](https://slaythespire.wiki.gg/wiki/Map_Generation), Slay the Spire wiki
- [Correlated randomness in Slay the Spire](https://tck.mn/blog/correlated-randomness-sts2/), tck.mn
- [Comment on how the random streams work](https://greaterwrong.com/posts/DvRBSzFjfaPYBhwmj/one-shot-strategy-games/comment/f8P3SjdjakEycnwRR), GreaterWrong

**A larger seed plan was also discussed but not approved.** Do not build any
of it under this issue:

- **Phase 1:**
  - entered seeds earn no Boon or ascension unlocks;
  - challenge links carry mode and ascension;
  - "Play this seed" from run history;
  - a test that pins one seed's first descents;
  - the seed shown during a descent.
- **Phase 2:** a Daily Descent:
  - the seed comes from the UTC date;
  - one scored attempt, then unscored practice;
  - a daily board ranked by sigils, then time.
- **Phase 3:** weekly runs with twists, word seeds, streaks.

Joey has not answered the open questions:

- whether the daily goes in batch 1 (issue 11's "0.4 as shipped" promise);
- how the daily is ranked;
- whether one attempt per browser is strict enough.

If Joey says go, each phase gets its own issue (41+).

## Where the code stands

Both rules already hold. Nothing needs fixing, only pinning down:

- The Trial is rolled at the end of each descent from its own stream,
  `theme:<sigils>` and `theme-children:<sigils>`
  (`logic/lifecycle.js:537`). It reads only the seed, the sigil count, and
  `themesFaced`, which is itself the earlier Trials. No player choice reaches
  it.
- Every other gameplay roll goes through `rngFor` or `playRoll`
  (`seed.js`). The choice-driven combat rolls are numbered per descent, so the
  same actions take the same rolls. The only `Math.random` calls left are
  cosmetic: card ids, the run record id, `runSeed`, the assigned name, and
  minting a new seed.

What the tests cover today (`test/seed.test.js`):

- "Keeps the themes, Trials and monsters when the players choose
  differently" walks **5 descents**, clearing each outright.
- "Plays the same dungeon, offers and Forge for two players who choose
  alike" covers sanctuary choices only. No test plays a room, so the combat
  rolls (Carrion, Brood, Gambler's Flail) are never compared between two
  runs.

## To do

- [x] Extend the Trial test to a full run of 10 descents, with the two
      players' choices diverging from the first sanctuary. Assert the Trials
      and Long Night children match at every descent.
- [x] Repeat it at each ascension level and with `specialMonsters` on. The
      rule is per rule set, so check it holds within each one, not just at A0.
- [x] A same-choices test that plays rooms: two runs on one seed (with
      different fallback rngs, as the existing walks use) take the same
      actions card by card, including at least one choice-driven roll, and
      their states match step by step (ignoring card ids).
- [x] Say the rule in `DESIGN.md` §7, where seeds are described, so a future
      change knows what it must not break.

## Done (2026-11-09)

Both rules held; no game code changed. All new tests are in
`test/seed.test.js`, under "the seed's promise (issue 40)":

- **A full run.** Two players on `K7Q2M9XD` walk all 10 descents
  (`SIGIL_TARGET`), parting at the first sanctuary (different Boon, one forges,
  one skips). Trials and Long Night children match at every descent. The test
  also asserts the choices really diverged and that The Long Night came up.
- **Every rule set.** The same pair at ascensions 0 to `ASCENSION_MAX`, with
  `specialMonsters` off and on (14 cases, `ascensions` flag on so the level
  counts). One more test shows A6 rolls different Trials from A0 on this seed,
  so the loop compares genuinely different rule sets.
- **Card by card.** Two runs on the seed with different fallback rngs play
  every room, taking the first playable card and fleeing when none can be
  played, through all 10 descents to victory. Their states match at every step
  (about 450 steps), ignoring card ids, `forgeInscribedIds` (a list of ids),
  the clock and the fallback rng. The walk makes 35 choice-driven rolls
  (Carrion is descent 10 on this seed). Both players are held at 999 HP after
  each descent starts, or the walk dies in the first room; HP feeds no roll.
- **The tests can fail.** Checked by breaking the code on purpose and putting
  it back: keying the Trial stream on the Boon and kit counts fails all 16
  Trial tests; taking combat rolls from the fallback rng fails the card-by-card
  test.
- `DESIGN.md` §7 gains "What a seed promises", and its old line that a seed
  "plays the same dungeon for anyone who enters it" (more than is promised) is
  corrected.
- Gate: lint and build clean, 774 unit + 229 e2e pass, 1 known skip.
- **GAME_VERSION: unchanged.** No game code changed; `0.4` stays.

## Not in scope

- Making the monster order match across different choices. Today the kit is
  shuffled in with the dungeon, so the order differs once the kits differ.
  Joey's call: that is fine.
- Challenge links carrying mode and ascension. That is the plan's Phase 1
  item; until then a friend on a different ascension can see different
  Trials, which this rule allows because the rules differ.
