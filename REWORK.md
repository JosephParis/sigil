# Scoundrel: The Kit Rework

A proposed major rework of the deck model. Nothing here is committed; this is the
design of record for the direction, capturing the decisions made so far and the
ones still open.

This doc sits alongside DESIGN.md (the current shape) and docs/EXTENSIONS.md (growth
ideas). Where the two conflict with this doc, this doc wins for anything inside
the rework; everything it does not touch (the run loop, sanctuary, sigils, Boons)
stays as DESIGN.md describes.

## 1. The one-sentence change

Today the player edits the whole 44-card deck. After the rework the player owns
and edits only their **weapons and potions** (the **kit**); the **monsters** become
the dungeon's pool, varying enormously from descent to descent. The two pools are
merged and shuffled into one deck at the start of every descent, so the game is
still Scoundrel at the table.

This sharpens the authorship split DESIGN.md already states. The player's voice is
the kit (the tools you bring). The dungeon's voice is the monsters (what you face).
You author what is in the deck; the dungeon authors the threats and the timing.

## 2. Why do this

- **It dissolves the degenerate Forge lever.** The Forge is rationed to three
  openings today only because unrestricted deck editing collapses into "Strike all
  the spades" by descent four (DESIGN.md section 5). Once the player edits only their
  own tools, that exploit cannot exist. Editing your kit is self-balancing: a better
  kit means better tools, and the dungeon scales to match. This is what makes
  frequent, rich deck editing safe.
- **It frees the monster side.** The monster pool never collides with player edits,
  so the dungeon can vary wildly in size, composition, and special cards without the
  Forge undoing it. This is where per-descent variety comes from.
- **It keeps Scoundrel intact.** Because the merged result is still one shuffled
  deck, every base mechanic survives: 4-card rooms, fleeing, reshuffle, and the
  weapon-ceiling bind.

## 3. The two pools

**The kit (player).** A persistent collection of weapon cards (diamonds) and potion
cards (hearts). The player curates it in the sanctuary. It carries across descents
within a run.

**The dungeon deck (dungeon).** Monster cards (clubs and spades), plus any hazards
or special monster cards the dungeon seeds. Rebuilt fresh each descent. The player
does not own or edit it.

## 4. Merge-and-shuffle (the table model)

At the start of each descent:

```
descentDeck = shuffle( dungeon.monsterDeck  +  player.kit )
```

Then play Scoundrel exactly as today. The player knows **what tools are in the
deck**, because they built the kit, but not **when** any of them will surface. The
"will a weapon come up before I am overwhelmed" gamble is fully preserved; only its
authorship moves. You control composition; the dungeon controls order and threats.

## 5. The kit

### Persist and tweak (decided)

The kit persists whole across descents within a run. Each sanctuary visit the player
**tweaks** it rather than rebuilding it. This matches the current HP-refill model and
keeps the recurring choice as "adjust my standing kit," not "reassemble from scratch,"
which avoids busywork.

### No size cap (decided, for now)

There is no hard cap on kit size for the first pass. Balance comes from the dungeon
side (dilution, monster volume, special monsters) rather than a slot limit. A cap is
a tuning knob we can add later if kits bloat into trivializing the game.

### Starting kit (decided)

The player wakes up holding the **low ten**: diamonds 2 to 6 and hearts 2 to 6 (five
weapons, five potions). The player starts under-equipped, so the early run is about
building the kit up and kit growth is felt progression. This sets the balance baseline
everything else is tuned against.

### Editing the kit (the Forge, opened often with a varying menu)

Because the player only ever touches their own tools, editing can be frequent and rich
without the old exploit. The editing station stays the **Forge** (the storyline keeps it:
the coals never died), but it is no longer rationed to three openings. The coals being
always warm is exactly why it can open every visit.

**Naming (decided).** Keep the Forge fiction and the `forge*` state fields. An earlier
draft proposed renaming the internals to `edit*`; we are not doing that, because the Forge
is an established storyline element and the every-visit cadence fits its "coals never died"
framing.

**Cadence (decided).** The Forge opens on **every sanctuary visit except the opening one**.

**Granted batch of typed edits (decided).** A visit does not ask the player to pick one
verb from a menu; it **grants a batch of edits whose types are chosen for the player**, and
the player carries each one out. The agency is "how do I spend the edits I was handed," not
"which one edit do I make."

- **How many:** 2 edits per visit through Tier 1-2, **3 from Tier 3** (sigils 5+). About
  14 edits a run, which is also the kit-growth dial against the scaling monster decks.
- **Types:** each grant is rolled from a weighted bag, **Inscribe 50 / Upgrade 35 /
  Remove 15**; an unavailable type (no upgrade target, kit too small to remove) falls back
  to Inscribe. Duplicates are allowed (two Inscribes can happen), but **at most one Remove
  per visit**, since multiple Removes is the only repeat rarely wanted.
- **Each edit is a card-choice screen:** the active grant shows **up to 4 candidate cards**
  laid out like a room or boon offer; the player picks one (or skips that edit), then the
  next grant opens. An "Edit N of M" header tracks the batch. Empty grants (e.g. an Upgrade
  with nothing left to upgrade) are skipped automatically.

**The three edits.** Each presents its 3-4 cards as selectable card faces:

- **Inscribe** adds a card to the kit. Its 4 candidates mix plain tools (weapons/potions at
  the progress rank cap) with the occasional special frame (Lucky Coin, Skeleton Key, and
  the like). It absorbed a separate Add; the `customCards` flag gates only the special
  frames within it, not the plain-tool adds. Cursed Idol is dropped (the player builds only
  tools). Inscribe is weighted high so kit growth is never starved.
- **Upgrade** raises a kit card's rank by +2 (capped at 10), chosen from up to 4 of your
  upgradable kit cards. Replaces the old Heft.
- **Remove** drops one of up to 4 of your kit cards. A real verb, not a penalty: thinning a
  dud raises the *density* of good tools against the dungeon's dilution.

State: `forgeGrants` (the ordered type batch), `forgeGrantIndex` (active edit), and
`forgeChoices` (the active edit's candidate cards), replacing the old single-pick
`forgeOffer` / `forgeUsed` / `forgeView` / `inscribeOffer`.

**Add bounding (decided).** The plain weapon/potion an Inscribe can offer is a concrete
rolled card whose rank is capped by run progress: `cap = 4 + sigils earned`, clamped to
10. Take it or skip. This scales kit power with progress instead of letting the player
front-load a rank-10 tool early.

**Deferred:** Reforge (change a kit card's suit), the natural future home for the retired
Transmute's idea.

## 6. What stays the same

Everything that makes it Scoundrel, because the merged result is one shuffled deck:

- 4-card rooms, flee, reshuffle: unchanged.
- The weapon bind (`lastSlain` ceiling): unchanged, and richer. The player now
  deliberately brings several weapons and manages which to bind on what. Quartermaster
  stops being exotic and becomes the native texture of a kit with multiple weapons.
- The draw gamble: fully intact. You packed the tools; you do not control their order.

## 7. The new scarcity

With "random weapon supply" replaced by a curated kit, a new pressure has to carry
the tension. With no kit cap, that pressure is **dilution**:

The dungeon controls monster **count**. A 40-monster descent spreads a fixed kit
across far more cards than a 20-monster descent: roughly one tool per eight cards
instead of one per four. Your kit does not shrink, but its **density** does. A
monster-heavy dungeon is simply your standing kit stretched thin. "The Swarm" is not
a new rule, it is a count.

This single dial generates a wide range of dungeon feel for free, and it is the main
balancing force against an uncapped, persistently-growing kit.

## 8. Descend fully blind (decided)

The player descends **fully blind**. Nothing about the upcoming dungeon is revealed in
the sanctuary: not monster count, not composition, not modifiers, not even the theme
name. You step into the dark not knowing what you face.

Consequence to design around honestly: the kit choice is therefore **not** "counter
the previewed threat." It is "build a kit robust against anything." You tune for
general resilience, and the dungeon surprises you. The kit is your standing answer,
refined over the run as you learn the range of what the dungeon throws, not a loadout
picked against a known fight.

This is a harder-edged stance, and it drops DESIGN.md's "see the upcoming theme and
spend your Boon as counterplay" loop entirely. Counterplay moves from prediction to
resilience: you cannot prepare for the specific dungeon, only for the shape of all of
them.

## 9. The dungeon side opens up

Freed from player editing, the monster pool can finally carry the variety:

- **Special monster cards (decided shape).** Three monster traits: **armored** (the
  weapon does nothing, so the fight resolves bare-handed and the blade's binding stays
  clean), **fast** (strikes twice when fought), **warded** (cannot flee a room while it
  is present). They were unsafe before because the Forge could simply Strike them; now
  the dungeon owns them. They are **tags on monster cards** (`card.armored` / `.fast` /
  `.warded`), not a new card type, exactly like `card.boss`, so they flow through the
  existing monster handlers with small branches. Assignment rides on the dungeon spec: a
  theme's spec gains an optional `traits` field of probabilities, and the sampler stamps
  each monster. Canonical/default descents carry no traits; they enter only through
  trait-bearing composition themes (The Bulwark / The Frenzy / The Snare).
- **Composition as identity.** A descent's character comes from its monster mix and
  count, not from a uniform rule stamped on the whole deck. This is also the answer to
  the earlier "make individual descents unique" question, reached through the same
  rework.

  **Where composition lives (decided).** It rides on the **theme**, one roll per descent
  (not a separate orthogonal "shape" axis). A shape is barely distinct from a theme as a
  data structure, so rather than roll two blind variables that stack, the theme gains an
  optional monster payload: `count` (the dilution dial), `bandWeights` over rank bands
  (low 2-6 / mid 7-10 / high 11-14), and `suitSkew`. Themes that omit it use a default
  spec that reproduces today's canonical 26 exactly, so existing themes are untouched;
  dilution and rank-skew enter only through new composition themes (The Swarm, The
  Gauntlet, The Press). You author the interesting combos rather than letting them emerge.
- **The dungeon may still disrupt the kit (no theme migration).** The split is about
  *ownership and editing between descents*, not about who may touch the tools during a
  descent. The player owns and edits the kit in the sanctuary; the dungeon is still
  free to weaken, dilute, or strip those tools transiently while you are down there. So
  the tool-side themes stay as they are: the Bog and Brine on weapons, the Cellar and
  Stillery on potions all keep working. Editing weapons and potions from the dungeon
  side is fine. Nothing needs to migrate.

## 10. What this costs

- **Strike is removed (decided).** Removing monsters was the player's verb; it is now
  the dungeon's domain, and Strike goes away. The "binding names beside the chains"
  lore (DESIGN.md section 5) goes dormant with it. No replacement removal verb ships;
  the player's verb becomes *build*, the dungeon's verb is *throw*.
- **Boons must stay distinct from the kit.** Keep Boons as rules and passives, the kit
  as the actual cards. If they blur, both feel mushy.
- **Full re-tune.** A curated, uncapped, persistent kit is a power gain. The dungeon
  has to push back through monster volume, rank, special cards, and dilution. Until
  that is balanced the game will feel either trivial or unfair. Expect a tuning pass,
  not a one-shot.

## 11. Open decisions

1. **Does the kit ever cap** (section 5)? Left uncapped for now; revisit if kits bloat.

Decided and closed: starting kit (low ten, section 5), the editing offering's shape
(every non-opening visit, one edit, verbs Inscribe / Upgrade / Remove, section 5), keeping
the Forge fiction and `forge*` fields rather than renaming to `edit*` (section 5), descend
fully blind (section 8), the dungeon may still disrupt the kit (section 9), Strike removed
(section 10).

## 12. Build order

Each step keeps the game playable.

1. **Split the deck model.** Separate the 44-card deck into `monsterDeck` (dungeon)
   and `kit` (player). Build `descentDeck` by merge-and-shuffle at descent start. No
   new content yet; with the kit seeded as the full tool half, the game should play
   identically to today, which makes this step verifiable.
2. **Set the starting kit to the low ten.** Seed the kit as diamonds 2 to 6 and hearts
   2 to 6, and remove the old Strike action. Persist the kit across descents within a
   run; refill HP as today. Confirm the bind and room mechanics are untouched.
3. **Kit editing in the sanctuary.** Replace the monster-touching Forge actions with
   the variable kit-editing offering (every non-opening visit, one edit, verbs Inscribe /
   Upgrade / Remove). Split into 3a and 3b. 3a (done): move kit edits to direct mutation
   of `state.kit`; retire the transmute/heft maps and Transmute; fold the Inscribe frames
   into the kit; keep the sigil-2/4/6 trigger temporarily. 3b: open the Forge every
   non-opening visit with a rolled verb subset (`forgeOffer`); rewire the mode/ascension
   cadence hooks.
4. **Monster-side dungeon variation.** Give the dungeon control of monster count
   (dilution) and composition, carried on the theme (one roll per descent, section 9).
   Themes gain optional `count` / `bandWeights` / `suitSkew`; a `buildDungeonMonsters`
   sampler builds the base monster set. Default spec stays the canonical 26 so existing
   themes are unchanged; add composition themes (Swarm, Gauntlet, Press). Monsters become
   a blind per-descent roll, so the sanctuary deck view switches to kit-only. The
   tool-side themes stay; no migration needed.
5. **Special monster cards.** Three monster traits as tags (`card.armored` / `.fast` /
   `.warded`), assigned via the dungeon spec's optional `traits` probabilities. Armored
   makes the monster weapon-ineligible (bare-handed fight); fast applies a second hit in
   the fight loop; warded blocks fleeing while it is in the room (a `canFleeRoom` helper
   gates flee + the UI). Add trait-bearing themes (The Bulwark / The Frenzy / The Snare).
   Default descents stay trait-free.
6. **Re-tune.** Balance the uncapped kit against monster volume and the new specials.
