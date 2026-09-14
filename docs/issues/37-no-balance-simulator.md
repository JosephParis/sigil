---
id: 37
title: "Nothing can measure the winrate targets the design doc sets"
priority: P3
area: testing
effort: L
status: in-progress
---

## Problem

`WINRATE_TARGETS.md` is a real specification. It fixes a total winrate, a
per-descent survival curve, per-tier bands for every theme, and a decision rule
for what to do when a theme falls outside its band. It even sets the sample
sizes needed before acting on a number.

**Nothing in the repo can measure any of it.** There is no simulator. The only
path to a winrate is `api/stats.js` aggregating rows in the `runs` table, which
means the balance spec cannot be checked until enough strangers have played
enough runs — and the sample-size section of that document says that is
thousands of runs.

So the one document that says what the game is supposed to *feel* like is the
only design doc with no way to fail. `DESIGN.md` and `REWORK.md` are held to the
code by `test/designDocs.test.js`. `WINRATE_TARGETS.md` is held to nothing.

The game logic does not deserve this. It was written to be simulated and nobody
has noticed:

- Every `logic/` function is pure and returns a **new** state object.
- The rng is **injected**, not imported — `createRun(rng, options)` takes it and
  stores it on the state (`lifecycle.js:19`, `lifecycle.js:71`).
- The run is a four-state phase machine — `sanctuary`, `descent`, `gameover`,
  `victory` — and every terminal transition fires **inside** the logic, so a
  driver only ever reads `state.phase` and applies one action.
- A seeded mulberry32 already exists in `test/support/state.js:14`.

A headless run loop is a few hundred lines over an API that is already the right
shape. What is missing is the loop, two policies, and somewhere to put the
number.

## Evidence

**The rng is already injected and already threaded through every random edge.**

```js
// src/games/scoundrel/logic/lifecycle.js:19
export function createRun(rng = Math.random, options = {}) {
```

```js
// src/games/scoundrel/logic/lifecycle.js:71
    rng,
```

- `lifecycle.js:205` — `buildDescentDeck(state, themeId, themeChildren, state.rng)`
- `lifecycle.js:217` — the Wormwood boon mute
- `lifecycle.js:505` — `pickThemeId(rng, ...)`
- `lifecycle.js:511` — `pickBoonOffers(..., rng, offerPool)`
- `lifecycle.js:516`, `lifecycle.js:518` — the Forge roll and batch

**The phase machine closes itself.** Nothing outside the logic needs to end a
descent:

- `src/games/scoundrel/logic/combat.js:852` — `checkRefillAndComplete` calls
  `endDescentVictory(state)` when the deck is exhausted
- `src/games/scoundrel/logic/combat.js:70` — `applyHpLoss` calls
  `endDescentDeath` when hp hits zero
- `endDescentVictory` and `endDescentDeath` are deliberately **not** in the
  `logic.js` barrel — components never call them, and a simulator must not
  either

**The action surface is small and complete** (all re-exported from
`src/games/scoundrel/logic.js`):

| Phase | Actions |
|---|---|
| `sanctuary` | `pickBoon(state, boonId)` · `applyForgeEdit(state, cardId)` · `skipForgeEdit(state)` · `descend(state)` |
| `descent` | `playCard(state, index)` · `playCardBare(state, index)` · `fleeRoom(state)` |
| `gameover` / `victory` | terminal — read `state.sigilsEarned`, `state.retired` |

**The pieces a greedy policy needs already exist**, and using them keeps the
policy honest to the game's own rules rather than a second implementation of
them:

- `combat.js:93` — `pickBestWeaponFor(state, monsterCard)`
- `combat.js:112` — `isWeaponUsable(state, monsterCard)`
- `logic/sanctuary.js` — `previewMonsterDamage`, `isWeaponUsableFor`

**The targets to measure against:**

- `WINRATE_TARGETS.md:44` — total ~20%, band 15–25%
- `WINRATE_TARGETS.md:52-66` — the per-descent survival curve, descent 1 at 97%
  down to descent 10 at 76%
- `WINRATE_TARGETS.md:70-81` — the per-tier bands, Quiet 96–98% through Tier 5
  75–80%
- `WINRATE_TARGETS.md:83-91` — the decision rule, including the ~3 point
  tolerance that exists so nobody chases noise

**The reference population is specified and it is narrow**
(`WINRATE_TARGETS.md:46-48`): the engaged **default-mode, Ascension 0**
population. A simulation of anything else is not comparable to these numbers.

## Why it matters for batch 1

- **Balance is the thing batch 1 experiences.** Everything else in this backlog
  is a bug, a payload or a policy. This is whether the game is any good, and it
  is the only open question that currently has no instrument at all.
- **The measurement arrives too late to act on.** Waiting for real runs means
  the first batch plays the unverified balance, and by the time the numbers
  exist those players have already formed their opinion and left.
- **Issue 29 is exactly the class of bug this catches.** The Forge silently
  closing at 7 sigils while the run needs 10 is invisible to lint, to the type
  system, and to every existing test — but a batch of simulated runs reports
  "zero Forge visits at sigils 8 and 9" without being asked. That bug sat in the
  codebase for months.
- **It makes `WINRATE_TARGETS.md` falsifiable.** Right now the document is an
  intention. With a stored baseline it becomes a test, which is the same move
  `designDocs.test.js` already made for `DESIGN.md` and `REWORK.md`.
- **It is nearly free after the first run.** Ten thousand headless runs cost
  seconds and no tokens. The alternative instrument is a person.

## Suggested fix

### Where it goes

`sim/` at the repo root, a sibling of `test/` and `visual/`. Not under `src/` —
nothing here ships, and the payload work in issues 16 and 32 makes that
distinction worth keeping obvious. If a second game is ever added, this becomes
`sim/<game-id>/`.

```
sim/
  run.js         one seeded run to a terminal phase, returns a record
  policies.js    randomPolicy, greedyPolicy
  report.js      aggregate N records into the curve
scripts/sim.mjs  CLI wrapper
```

### The loop

The whole driver, in shape:

```js
let s = createRun(seededRng(seed), { mode: DEFAULT_MODE, ascension: 0 })
let guard = 0
while (s.phase !== 'gameover' && s.phase !== 'victory') {
  if (guard++ > MAX_STEPS) throw new Error(`run ${seed} did not terminate`)
  s = policy(s)           // returns the state after exactly one legal action
}
return record(s)
```

The guard is not optional — see the second trap below.

### The two policies

- **`randomPolicy`** — uniform over the legal actions in the current phase. It
  is the floor, and it exists so the greedy number means something.
- **`greedyPolicy`** — one-ply, no search: equip a weapon when it beats the
  current one, use `pickBestWeaponFor` and `previewMonsterDamage` to take the
  cheapest monster available, drink when below a health threshold, flee when the
  room's cheapest option would kill. Take a boon and a Forge edit by a simple
  stated preference rather than an evaluation.

Neither is a good player, and neither needs to be. They are two fixed points
that let a balance change be read as a delta.

### What the report prints

Per batch: total winrate, survival per descent, survival per theme with its tier
band and whether it is in, out, or inside the 3-point tolerance, deaths by
cause, and Forge visits per run. That last one is what would have printed a zero
where issue 29 lives.

### The baseline

Store the greedy-policy curve over a fixed seed range in `sim/baseline.json` and
add a vitest case that fails when the run leaves the band. This is the same
pattern the backlog README already uses for test counts — a stored number, and a
rule that says divergence is a regression rather than noise.

Keep the batch in that test small and the seed range fixed, so it stays a
sub-second unit test rather than something people start skipping.

### Known traps

Four things that will produce a simulator that runs happily and reports
nonsense:

1. **`state.rng` is a closure with mutable internal state, stored inside the
   state object** (`lifecycle.js:71`). Because states are spread-copied, every
   derived state shares one rng and one counter. Mint a fresh `seededRng(seed)`
   per run, and do not build any kind of tree search or replay-from-snapshot on
   this without changing that first.
2. **`descend` silently returns the same state unless a boon has been chosen**
   (`lifecycle.js:190`: `if (!state.boonChosen) return state`). A policy that
   forgets to pick a boon produces an infinite loop that looks like a hang rather
   than an error. Hence the step guard.
3. **The tutorial uses a curated, unshuffled deck** (`lifecycle.js:200-203`).
   Simulate with `tutorial: false` or the numbers describe a scripted lesson.
4. **Mode and ascension must be the reference population** — default mode,
   Ascension 0 (`WINRATE_TARGETS.md:46-48`). Simulating Hardcore and comparing it
   against these bands is a category error.

### Interruption safety

Each piece commits independently and is worth having alone: the run loop, then
the random policy, then the greedy policy, then the report, then the baseline
test. A run that lands only the loop and the random policy has still moved the
project.

## GAME_VERSION

**No `VERSION_HISTORY` entry. This changes no gameplay** — it only observes it.
Nothing under `src/games/scoundrel/` should be modified by this issue beyond
exports, and if the simulator cannot reach something without a logic change,
that is a finding to record here rather than a licence to edit the rules.

The simulator will very likely *motivate* balance changes. Each of those is its
own issue and makes its own `GAME_VERSION` call, per the rule in the backlog
README.

## Acceptance criteria

- [ ] `sim/` drives a complete run headlessly from `createRun` to `gameover` or
      `victory` using only the barrel exports in `src/games/scoundrel/logic.js`
- [ ] The same seed produces an identical run record across processes
- [ ] `randomPolicy` and `greedyPolicy` both play legal runs to termination
- [ ] A step guard fails loudly on a non-terminating run instead of hanging
- [ ] `npm run sim -- --runs 10000 --policy greedy` prints total winrate,
      per-descent survival, per-theme survival against its tier band, deaths by
      cause, and Forge visits per run
- [ ] Simulation defaults to the reference population: default mode, Ascension 0,
      `tutorial: false`
- [ ] `greedyPolicy` materially outperforms `randomPolicy` — if it does not, stop
      and record that here, because it means something is wrong with the policy
      or with the game
- [ ] `sim/baseline.json` holds a greedy curve over a fixed seed range
- [ ] A vitest case fails when the simulated total winrate leaves the 15–25%
      band, and runs in under a second
- [ ] The measured curve is written into this file, next to the targets it is
      being compared against, whether or not it agrees with them
- [ ] Forge visits per run are checked against `SIGIL_TARGET - 1` at Ascension 0,
      so issue 29's regression cannot come back silently
- [ ] Nothing under `src/` imports `sim/`, and the bundle does not grow
- [ ] `npm run lint && npm run build && npm run test` clean, with the baseline
      table in `docs/issues/README.md` updated to the new counts

## Measured, 2026-09-09 (partial — `dawn/2026-09-09`)

The loop and both policies are built (`sim/run.js`, `sim/policies.js`,
`test/sim.test.js`). The report, the CLI and `sim/baseline.json` are not.

**The first number the instrument produced disagrees with the spec, hard.**
Over 40 seeds at the reference population (default mode, Ascension 0,
`tutorial: false`):

| Policy | Winrate | Descent 1 survival | Avg actions | Deaths | Forge visits |
|---|---|---|---|---|---|
| random | 0% | **0%** | 12.8 | all `monster` | 0 |
| greedy | 0% | **0%** | 26.3 | all `monster` | 0 |

Against `WINRATE_TARGETS.md:44` (total ~20%) and `:52-66` (descent 1 at 97%).

**This is recorded, not explained.** Which side the gap is on is open:

- `greedyPolicy` is one ply and crude. It takes weapons in room order, so it
  will discard a good blade for a worse one, and it drinks on a fixed 70%
  threshold. A weak policy dying in the warm-up descent is plausible.
- Against that: descent 1 is The Quiet, +10 max HP and the friendliest theme in
  the game, and the target for it is 97%. A policy that never once clears it
  over 40 seeds is a large miss.

**Do not treat the 0% as a balance verdict until the greedy policy has had a
second pass.** Strengthening weapon selection is the first thing to try.

The "greedy materially outperforms random" criterion is met on **actions
survived** (26.3 vs 12.8) and **not** on descents reached, where both sit at 1.
`test/sim.test.js` asserts the former and says why in a comment, so a green
test cannot be mistaken for agreement with the targets.
