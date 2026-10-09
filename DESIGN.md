# Scoundrel: Roguelike Design

> **Superseded — this is the pre-rework design, kept for its reasoning.**
>
> **[REWORK.md](REWORK.md) describes the game that actually ships.** Where the
> two disagree, REWORK.md wins, and the code wins over both. This file is
> retained because the fiction, the premise, and the reasoning behind the
> mechanics that survived are still only written down here.
>
> Three things in here are flatly wrong about the shipped game, and are corrected
> in place below so nobody builds a mental model on them:
>
> | This doc used to say | The shipped game |
> |---|---|
> | Seven sigils to escape | **Ten** (`SIGIL_TARGET`, `src/games/scoundrel/constants.js`) |
> | The next descent's theme is revealed in the sanctuary | You descend **fully blind** — the Trial is named as you arrive |
> | The player edits a whole 44-card deck, Strike included | The player owns and edits only a **kit** of weapons and potions; the dungeon rolls its own monster pool each descent, and **Strike no longer exists** |
>
> Sections marked **(historical)** describe mechanics that were designed and then
> cut or replaced. They are not a spec of anything running today.

A design plan for turning the 44-card Scoundrel base game into a roguelike. **The dungeon does not move; you do.** You enter the same dungeon again and again. Each visit, it wears a different face. Each visit, you bring something new.

## 1. Premise

You are stuck. There's one room in this place that's safe (the **Sanctuary**), protected by something specific to the fiction so monsters can't enter. There's one way out, and it's locked. To unlock it you have to leave the sanctuary, descend into the dungeon beyond, and bring back what the lock wants. Then you do it again. And again.

The sanctuary, the enclosure, and the single exit are fixed features of every setting. The fiction explains them differently but the shape is constant:

- **Sanctuary** = a small enclosed space, warded/sealed against the dungeon, where you sleep, plan, and tinker. This is where you pick Boons and visit the Forge. (You do **not** see the next theme — see the banner above.)
- **Enclosure** = the wider place you can't leave through any normal means: vacuum, lockdown, interdict, grave-stone.
- **The One Way Out** = a specific door/lift/passage. It has a lock with a defined opening condition (ten sigils, one per completed descent).

The setting below uses undead rather than thinking enemies. That matters for the premise: the dungeon is meant to be the *same* dungeon every descent. Intelligent inhabitants (orcs, goblins, warbands) would actively reshape territory between visits, which fights the design. Undead don't plan. What shifts is which of them are stirring, and where, not what they're doing about you.

(Names are placeholders. We can rename anything that sticks to a proper noun in a later pass.)

### The fallen mountain-hold

The mountain-hold was once the greatest of the deep kingdoms. Its halls are full of the dead now, its sublevels are warrens of shambling and risen things, and the dwarves who built it are gone, except for you and the handful of survivors who hold the **great hall** at the hold's heart. The inner threshold is wound with rune-chains laid a thousand years ago by a saint nobody alive remembers; nothing from the dark has ever crossed them. The chains glow faintly. No one knows how to renew them.

You can't leave by any normal path: the lower gates collapsed in the last fall, the side passages buckled when the dead pressed against them, and the deeps have no end. The one way out is the **high gate** at the top of the hold, the gate that opens upward, into open air. Its rune-anchors lost their power when the throne broke. You need to recover **ten throne-shards** from the lower halls, one per descent, and seat them back in their sockets.

**Who lives down there.** Nothing that plans. Risen dwarves who were the hold's last defenders, still wearing what armour they died in. Wraiths of older warriors bound to the stones they fell on. Ghoul-things that crawled up from the river-passages. In the deepest delvings, things the dwarves found and shouldn't have, that never lived to begin with.

**Why the dungeon shifts.** Two reasons, both ambient. First: the hold's ancient wards are failing in patchwork. Different sections leak different things on different nights. Second: deeper still, something old half-dreams the dead awake. Neither force has an agenda toward you. The shifts feel like weather: tides of cold, the slow waking of one stone-tomb after another, a wall of mist that wasn't there last time.

**Tone.** Mournful, deep-mountain, the last of a long line. The hold is a grave and you live in it.

The rest of this doc uses generic terms (descent, theme, sigil, sanctuary) and stays setting-neutral.

## 2. The core loop

A **run** is a sequence of **descents** into the dungeon, threaded by visits to the **Sanctuary**, the safe room described in §1. Every descent starts in the sanctuary; every descent ends in the sanctuary, or in death. A descent is one straight playthrough of a deck that is merged and shuffled at descent start from the player's **kit** (weapons and potions they own and edit) and the dungeon's freshly rolled **monster pool** — see [REWORK.md](REWORK.md) §3–§4. It is lightly mutated by the dungeon's **Theme** (§3). No internal sub-structure inside a descent. You just play Scoundrel, with whatever rules the theme imposes.

```
[Sanctuary]─▶[Descent 1]─▶[Sanctuary]─▶[Descent 2]─▶[Sanctuary, Forge]─▶[Descent 3]─▶ … ─▶[Descent 10: door opens]
```

When you return to the sanctuary after a successful descent:
- HP refills to max.
- You earn a **sigil** for completing the descent.
- You pick **one Boon** from three offered. (Player's permanent change.)
- The **Forge** opens, on every visit but the opening one. It hands you a small batch of edits to spend on **your kit** — Inscribe, Upgrade, Remove (REWORK.md §5). It does not touch monsters.

You are told **nothing** about the descent ahead. The Theme is named as you arrive, never before.

The run **ends in victory** when you have **ten sigils**. The way out (the bridge, the surface lift, the gatehouse, the threshold-stone) unlocks. The next descent leads outside instead of back to the sanctuary, and you escape.

The run **ends in defeat** when you die in a descent. Sigils, Boons, and the kit are lost. The sanctuary persists in fiction (you wake there again) but its contents reset for the next run.

State that carries between descents (within a run):
- **Boons**: permanent.
- **Kit**: permanent. Cards you inscribe, upgrade or remove stay that way for the rest of the run.
- **Sigils**: permanent.
- **Weapon**: your equipped weapon carries between descents. Its `lastSlain` constraint resets in the sanctuary, so the weapon arrives "rested" each descent (you can still swap it out by playing a new diamond).

State that **doesn't** carry:
- Dungeon's theme.
- HP, discard pile, room state, all reset at the sanctuary.

### Combat: weapon or bare hands

Every monster card in the room offers two single-click actions, no modal:

- **Click the card**: default fight. Uses the weapon if it's usable for this monster (see rules below); otherwise resolves bare-handed automatically. The card shows the predicted damage for whichever path it'll take (`⚔ take N` or `✊ take N`).
- **"Bare hands" button below the card**: appears only when the weapon *is* usable but you'd rather not commit it. Forces a bare-handed fight. One click.

**When is the weapon usable?**

- If the weapon hasn't killed anything yet (`lastSlain` is `null`), it's usable on **any monster**, regardless of rank.
- Once it has killed something, it's usable only on monsters whose rank is **at or below** the last-killed rank. The weapon binds to its own ceiling.

Damage:

- **With the weapon**: damage = `max(0, monster rank − weapon rank)`. Always sets `lastSlain` to the monster's rank, regardless of how easy the kill was.
- **Bare-handed**: damage = full monster rank. The weapon and `lastSlain` are untouched.

**Why bare-handed matters as a choice.** Using the weapon always sets `lastSlain`. Even an "easy" kill (monster ≤ weapon) caps your weapon's reach on future stretch fights. Sometimes you'd rather eat the HP cost on a mid-rank monster to keep the weapon's ceiling clean for the J/Q/K/A you can see coming.

**In fiction.** The bind on the blade is a rune-bind, set at the forging. The blade tires with each name it takes, and only swings clean for lesser names afterward. You can always take a name with your bare hands instead and keep the blade's edge for something worse.

### Why no internal structure inside a descent

The base Scoundrel game already has a pacing curve baked into the 44-card deck. The player feels the dungeon tighten as the deck thins. Subdividing it into "antechamber / halls / sanctum" was over-engineering. Each descent is one clean pass through 44 (or modified) cards; the cross-descent layer is where progression lives. We can add intra-descent phases later if a specific theme or late-run twist needs them, but the v1 shape is *one descent = one Scoundrel game with a modifier*.

## 3. Themes (the dungeon's voice)

Each descent runs with one **Theme**, a deck-and-rules mutation that lasts only for that descent. The dungeon picks the theme, and the player does not learn it until they are already down there.

Themes are tiered. **The three tiers below are the original pool and are long
out of date** — the shipped game has five tiers, gated at 2 / 3 / 5 / 7 sigils,
with far more Trials than are listed here. `src/games/scoundrel/themes.js` is the
list; what follows is kept for the tier *idea* and the counterplay rule at the
end of the section, which both still hold.

### Descent 1: The Quiet (always)
The opening descent of every run runs under a fixed warm-up theme:
- **The Quiet**: The deep dream is still asleep. Max HP +10 for the descent. The dungeon adds no harmful modifiers.

Not in any tier pool, never rolled by the dungeon. Always assigned to descent 1 by `createRun`.

### Tier 1: Light (descents 2–3)
Single deck bias, no rule changes. Used to teach the system.
- **The Crypt**: +2 spade face cards seeded into the deck; one heart removed.
- **The Armory**: +3 diamonds in the deck; one club removed.
- **The Menagerie**: all clubs +1 effective rank.
- **The Apothecary**: +2 hearts; second potion of any room *damages* you for its rank instead of healing.
- **Sharpened Fangs**: every monster +1 effective rank.
- **Rusty Edge**: new weapons enter at −1 rank.
- **Bitter Brew**: potions heal ⌈rank/2⌉.

### Tier 2: Heavy (descents 4–6)
Rule changes, harder bias.
- **Blood Moon**: max HP −4 for this descent only.
- **Hungry Dark**: cannot flee.
- **Cramped Halls**: rooms hold 5 cards; must clear to 1 to refill.
- **Iron Bones**: monsters of the same suit chain: second consecutive same-suit monster hits +2.
- **Cracked Blade**: if your weapon hits a higher-rank monster than its last kill, it breaks.
- **The Oath**: the first card drawn into each room is face-down until played.
- **Tithe**: lose 1 HP per room entered.

### Tier 3: Spire (descents 7+)
Tier 2 effects pair up; weirder rules.
- **Echo**: every 3rd room contains a duplicate of one of its cards.
- **Carrion**: slain monsters return to the deck once, at rank 2.
- **Wormwood**: one random Boon is muted this descent.
- **Suitfall**: at the end of each room, all remaining cards rotate suit clockwise (♥→♦→♣→♠→♥).
- **The Long Night**: combines two Tier 1 themes.

### How the dungeon picks

**Descent 1 of every run always runs under The Quiet** (see above). It's a deliberate warm-up: the deep dream is still asleep, the player gets +10 max HP, the dungeon adds nothing harmful. The Quiet is never rolled by the dungeon for any other descent.

From descent 2 onward, the dungeon escalates. Descents 2–3 always pick a Tier 1 theme; the tier ceiling rises with sigils earned. **Counterplay is resilience, not prediction.** An earlier draft revealed the upcoming theme so a Boon could be spent against it; the shipped game reveals nothing, so a Boon is chosen for how broadly it holds up (REWORK.md §8).

Design rule: **every theme should have at least one Boon that *wants* it.** A theme without counterplay isn't a challenge, it's a tax. Iron Bones wants Quartermaster (two weapons). Hungry Dark wants Cartographer (foresight). Cramped Halls wants Vanguard (first-hit shield). Bitter Brew wants Alchemist (+2 HP per potion, softening the halved heals). When we add a theme, we either find or invent its counterplay Boon.

## 4. Boons (the player's voice)

Three offered each sanctuary visit. All permanent for the rest of the run.

**The list below is the original set and is incomplete** — the shipped pool is
larger and several of these were retuned or cut. `src/games/scoundrel/boons.js`
is the list. The tagging rule at the end of the section still holds.

### Combat
- **Whetstone**: weapons enter at +1 rank.
- **Vanguard**: first monster fought each room takes 2 less damage.
- **Sworn Vendetta**: +2 damage vs spades.
- **Hunter**: +2 damage vs clubs.
- **Riposte**: when a monster damages you, the next monster takes that much less.
- **Quartermaster**: carry two weapons; pick which to use each fight.

### Survival
- **Iron Will**: max HP +3.
- **Second Wind**: once per descent, surviving to ≤3 HP heals to 6.
- **Soothsayer**: see the top card of the deck at all times.

### Economy
- **Deep Draught**: two potions per room instead of one.
- **Alchemist**: every potion you drink heals 2 extra HP.
- **Temperance**: clear a room without drinking a potion and heal 3 HP.
- **Pickpocket**: fleeing keeps one card from the room.

### Build-defining (rarer)
- **Scoundrel's Cloak**: once per descent, fleeing doesn't reshuffle.
- **Glass Cannon**: weapon damage +4, max HP set to 10.
- **Twin Souls**: on death, revive once at 1 HP this descent.
- **Cartographer**: at the start of each descent, see the full room order.

Boons are tagged (Combat / Survival / Economy / Build). The offer draw biases toward tags you've taken less, so a run can't degenerate into "six Combat Boons in a row."

## 5. The Forge — deck editing *(historical)*

**This section describes the pre-rework Forge and is not what ships.** The player
no longer edits the dungeon's cards at all: the Forge opens every non-opening
sanctuary visit and grants a batch of edits over the player's own **kit**
(Inscribe / Upgrade / Remove), described in [REWORK.md](REWORK.md) §5.
**Strike and Transmute were removed.** Everything below is kept for the fiction
and for the reasoning about why unrestricted deck editing had to be rationed —
which is exactly the problem the kit split dissolved.

At sigils 2, 4, and 6, the Forge opened during the sanctuary visit. Pick **one**:

1. **Strike**: remove a monster from the deck *and* a weapon or potion of the **same rank** as a matched offering. Both cards leave the deck for the rest of the run. (See "Strike, in fiction" below.)
2. **Transmute**: change a card's suit (e.g. a brutal K♠ becomes K♦, a Q♠ becomes Q♥).
3. **Inscribe**: add one **custom card** to the deck.

### Strike, in fiction

The inner threshold of the great hall is wound with the saint's rune-chains, but there is room *beside* them for more carvings. The surviving dwarves keep the old records: name-rolls of everyone interred in the lower halls, every shape the deeper things took when the older delvers gave them names. When a name from those rolls is carved into the threshold, the chains accept the carving. The half-dream below loses its hold on that one specific dead. It does not rise again, anywhere in this hold, for as long as the carving holds.

The half-dream below knows the weight of every name, and the threshold will not accept a carving unbalanced. So the rite needs a **matched offering** consumed alongside the carving: a weapon of equal rank to the name being bound, or a potion's draught of equal grace. The name is set in the stone; the offering is destroyed in the kindling; both leave the hold together.

**Why Strike removes a *card*, not an *instance*.** You're not killing one shambler. You're binding a *class* of dead. The thing the card represented is gone from the hold's possible inhabitants for the rest of the run.

**Why face-card dead are immune.** Weapons and potions in this hold come only in lesser ranks (2–10). No smith ever forged a king-weapon here, no apothecary ever distilled a king-draught. The threshold cannot accept a carving whose weight no offering can match, so the strongest dead (J, Q, K, A of the monster suits) can't be unbound this way. They have to be fought, Transmuted, or fled past.

**Why Strike is rationed.** The threshold has limited carving-room: only so many names can be set beside the saint's chains before the rune-pattern grows confused and the chains weaken. And the survivors can only carve cleanly in the silence between descents, when the deep dream is not actively churning. Three openings per run (sigils 2, 4, 6) is the in-fiction cap, not just a mechanical knob.

**Why the carvings don't persist between runs.** When you die in the lower halls, the survivors die with you. The threshold fades back to bare stone, the rune-chains forget what was carved beside them, and the next person to wake in this hall walks into the same dungeon you did, untouched. (This is also the lore for why Boons don't carry across runs: the people who knew the rite are gone.)

### Custom card frames

The player picks a frame and fills in a number. Frames cap the numbers so nothing trivially breaks the game; we can unlock the high end via specific Boons later.

| Frame | Plays as | Numbers |
|-------|----------|---------|
| **Lucky Coin** | A heart that heals X, then the room refills another card. | X = 3–6 |
| **Cursed Idol** | A spade that hits you for X; the next monster you fight drops a free potion. | X = 2–5 |
| **Honed Edge** | A diamond weapon of rank X that never breaks. | X = 5–7 |
| **Black Pact** | A club of rank X; if you survive the fight, your weapon gains +1 rank permanently. | X = 8–12 |
| **Mirror Shard** | When drawn, copies the previous card played from this room. | n/a |
| **Skeleton Key** | Skips the room and refills it. One in the deck total. | n/a |

Inscribed cards persist for the run. They show in their own tray on the sanctuary screen so the player remembers what they've authored into their own deck.

*Of these frames, Inscribe still offers Lucky Coin, Honed Edge, Skeleton Key and
kin as special kit cards. Cursed Idol was dropped — the player builds only tools.*

### Why the Forge is gated to three openings per run

Deck editing is the strongest mechanic in the design. If it triggers every sanctuary visit, runs converge on "strike all the spades" within four descents. Three openings (sigils 2, 4, 6) keeps it precious and gives the dungeon time to react between edits. Cadence is tunable.

## 6. Difficulty and pacing knobs

Things to tune once the systems are real:

- **Theme tier ramp**: five tiers, unlocking at 2 / 3 / 5 / 7 sigils (`themes.js`). Move the gates around.
- **Boon offer count**: currently 3, with one reroll per run.
- **HP refill in the sanctuary**: currently full. Could be partial to make Iron Will more valuable.
- **Forge cadence**: every sanctuary visit but the opening one, granting 2 edits through Tier 1-2 and 3 from Tier 3.
- **Sigils required to escape**: currently 10 (`SIGIL_TARGET`). Lower for a tighter run; raise for a longer one. Daily-seed mode could mutate this.

### Opening-descent buff (every run)

The opening-descent max HP buff has been promoted into the theme system as **The Quiet** (see §3) and bumped to +10. It applies to descent 1 of *every* run, not just the first time playing. The localStorage `firstRunDone` flag is gone; there's no longer a one-time onboarding window.

A tutorial-flavoured starter-room buff (guaranteed weapon + potion in the opening hand) was prototyped and removed. Keep on the shelf for a real tutorial pass later.

## 7. Meta-progression (between runs) *(historical — never built)*

**None of this shipped.** There is no Memory Slot, no Codex and no daily seed in
the game; progression is entirely within a run. What did ship is the piece a
daily seed would stand on: every run has a shareable seed (issue 38), and the
same seed plays the same dungeon for anyone who enters it. The section is kept because the
*stance* below — no persistent stat boosts, every run a fresh dungeon — is still
the position, and any future meta layer has to argue with it.

Deliberately light. The point is for each run to start as a real, playable dungeon, not a stat-stick grind.

- **Memory Slots** (3): pin one Boon to always appear in offers. Earned by surviving descents 3 / 6 / 9 for the first time.
- **Codex**: every custom card you inscribed in a *winning* run is saved and can be re-inscribed in future runs without needing a frame slot.
- **Daily Seed**: themes, offers, and Forge options are fixed for the day. Players can compare runs.

No persistent stat boosts. No "+5 HP at run start forever." Each run is a fresh dungeon.

## 8. Build order *(historical — complete)*

The original build order, all of it shipped. The kit rework's own build order,
which supersedes steps 6-7 here, is [REWORK.md](REWORK.md) §12.

1. **Sanctuary scaffolding**: wrap the current single-deck game in a run loop. After death-or-victory, show the sanctuary screen, refill HP, descend again. Award one sigil per completed descent; run wins at the sigil target. No Themes or Boons yet, just multi-descent.
2. **Boons (hardcoded set of 4)**: Whetstone, Iron Will, Deep Draught, Vanguard. Pure functions over game state. Apply them at descent start.
3. **Theme system (Tier 1 only)**: pick a theme each descent and apply its deck/rule mutation. Show it on the sanctuary screen for next-descent preview.
4. **Theme pool expansion**: fill out Tier 2 and Tier 3.
5. **Boon pool expansion**: fill out the rest of §4.
6. **Forge: Strike & Transmute**: the deck-editing actions without custom cards. *(Both removed by the kit rework.)*
7. **Forge: Inscribe**: custom card frames, starting with Lucky Coin (easiest hook). Add one frame per cycle.
8. **Meta layer**: Memory Slots, Codex, daily seed.
9. **Bosses (deferred)**: see §10.

## 9. Open questions *(historical)*

- **Should the dungeon ever do something permanent?** v1 says no. Themes are transient, Boons/Forge are permanent, asymmetric. But a late-run "Scar" mechanic (the dungeon permanently mutates the deck after every Nth descent) could match the player's authorship and raise the ceiling. Worth prototyping after step 5 if the player feels too powerful late.
- **Counterplay coverage**: does every theme actually have a Boon that wants it? Audit this when the pools are filled out.

## 10. Deferred

Bosses, the final-boss fight, anything that needs more than one descent of buildup. Picked up after step 8, once the rest of the system is real and we know what shape a boss should take inside this loop.
