---
id: 39
title: "A seed can be shared, but not a time to beat on it"
priority: P2
area: product
effort: M
status: done
branch: issue-39-seed-challenges
---

## Problem

Issue 38 gave every run a seed and a link, so a friend can play the same
dungeon. What Joey asked for next is the reason to: "Hey, I won on this seed
and it took me this long, can you beat it?" Before this issue:

- The link carried the seed and nothing about the run. A friend opening it had
  no time to chase and no idea who set it.
- The end screen showed the seed and a copy link, with no way to say *I won
  this, in this long*.
- There was nowhere to compare. The main leaderboard deliberately leaves out
  runs on an entered seed (issue 38) — which is every friend's run on a shared
  seed — so two friends on one seed never appeared on the same board.
- A player who lost to the time had no way back into the same seed except
  typing the code again.

## Resolution (2026-10-12)

- **Challenge links.** `/?seed=K7Q2-M9XD&v=0.4&t=872&by=Cassandra`: `t` is the
  time in whole seconds, `by` the sharer's leaderboard name (left off when they
  play unlisted). `parseChallenge` in `seed.js` refuses a time of zero, a
  negative or unreadable one, or one over ten hours, and clamps the name to 32
  characters. Both are the sharer's own claim, shown only to whoever opens the
  link; the seed board is where times are checked against what the server
  recorded.
- **The run carries it.** `createRun({ challenge })` stores it as
  `{ seed, durationMs, by }`, tied to the seed: typing a different seed drops
  it (`setRunSeed`), since the time was set on another dungeon.
- **Opening visit:** "Beat Cassandra's 14:32 on this seed."
- **End screen,** for any seeded run:
  - the verdict against the challenge: beat it by how much, who still holds it,
    or (on a death) that the time stands;
  - **Challenge a friend** (victories only): the share sheet on phones, the
    clipboard elsewhere, with "I escaped Sigil in 12:01 on seed K7Q2-M9XD. Can
    you beat it?" and a challenge link carrying the player's own time;
  - **Play this seed again**, keeping the friend's time;
  - **Seed board** (not in the standalone build, which has no `/api`).
- **Seed board.** `GET /api/leaderboard?seed=<code>` ranks every victory on that
  seed, entered or minted, one row per player, under the same dev, blocklist,
  duration and room-count rules as the main board. An unreadable seed is a 400,
  not the main board. Indexed on `record->>'seed'` (`runs_seed_idx`, in both
  `runsTable.js` and `db/schema.sql`).
- **Uploaded runs** must carry a canonical seed or none (`bad_seed`), and a
  boolean `seedChosen` (`bad_seed_chosen`), so the board's exact-match lookup
  can never miss a row because of how it was spelled.
- A victory on an entered seed now says it is listed **on the seed board**,
  not implying the main one.

Not done: per-seed boards for mode and ascension. A challenge does not carry
either, and a friend who has not unlocked the sharer's ascension cannot match
it; the board shows each row's ascension, as the main one does.

## Tests

- `test/seed.test.js` — 7 more: the link round-trip, the parse rules, and the
  challenge's tie to its seed.
- `test/leaderboard.handler.test.js` — the seed board's pool and the 400.
- `test/validate.test.js` — the seed and `seedChosen` rules.
- `visual/seed-challenges.spec.js` — 9: the link, the verdicts, the dare's
  clipboard text and link, replaying the seed, and the seed board (served by
  `page.route`, since the dev server has no `/api`), including that closing it
  puts the main board back.
