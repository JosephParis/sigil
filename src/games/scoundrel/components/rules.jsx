import { useState } from 'react'
import { BOONS, getVisibleThemes, SIGIL_TARGET } from '../logic'
import { CardLibraryContent } from './cardLibrary'

// -- Tutorial intro (shown in sanctuary action slot) -------------------

export function TutorialIntroPanel() {
  return (
    <section className="panel panel-warm p-5 space-y-3">
      <div className="text-center">
        <h2 className="font-display text-rune text-2xl mt-1">Tutorial</h2>
      </div>
      <p className="text-[15px] text-slate-300 leading-relaxed">
        A 22-card walkthrough. You'll be pointed to a recommended action each
        step, with a hover tip on every card. Somewhere in the middle the room
        will turn ugly and the Flee button lights up.
      </p>
    </section>
  )
}

// -- Inline opening-visit rules panel ----------------------------------

// Printed in full on desktop, where the rail leaves room for it. On mobile the
// brief rules run ~620px on their own and push Descend two screens down, so
// they collapse to a prompt that opens the same rules the top bar does (the
// long-form version, which reads better on a phone anyway).
export function RulesInlinePanel({ onOpenFull }) {
  return (
    <>
      <section className="panel panel-warm p-5 hidden md:block">
        <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
          <h2 className="font-display text-rune text-xl">How to play</h2>
          <span className="text-[11px] text-slate-500">
            The button up top brings this back any time.
          </span>
        </div>
        <RulesContentBrief />
      </section>
      <button
        onClick={onOpenFull}
        className="md:hidden panel panel-warm w-full p-3 flex items-center gap-3 text-left hover:border-rune/40 transition"
      >
        <span className="shrink-0 w-7 h-7 rounded-full border border-rune/40 text-rune grid place-items-center text-sm">
          ?
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-rune text-sm">How to play</span>
          <span className="block text-[11px] text-slate-500 leading-snug">
            New here? The rules, in about a minute.
          </span>
        </span>
        <span className="shrink-0 text-rune text-lg leading-none" aria-hidden="true">›</span>
      </button>
    </>
  )
}

// -- Rules modal -------------------------------------------------------

// Boons and Trials came back for the playtest (issue 12): a Boon is offered by
// name and nothing else says what it does once the offer is gone. Card library
// stays parked -- with bosses and special monsters off it renders only the
// Forge inscriptions, which the Forge already describes. Re-enable by
// uncommenting its entry; the panel is untouched (see RulesModal).
const RULES_TABS = [
  { id: 'rules', label: 'How to play' },
  { id: 'boons', label: 'Boons' },
  { id: 'themes', label: 'Trials' },
  // { id: 'library', label: 'Card library' },
]

function RulesTabBar({ tab, setTab }) {
  // A one-item tab bar is just a label that looks clickable.
  if (RULES_TABS.length < 2) return null
  return (
    <div className="flex flex-wrap gap-1 mb-5 border-b border-stone-800">
      {RULES_TABS.map(t => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition ${
              active
                ? 'border-rune text-rune'
                : 'border-transparent text-slate-500 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function RulesModal({ open, onClose }) {
  const [tab, setTab] = useState('rules')
  if (!open) return null
  const title = RULES_TABS.find(t => t.id === tab)?.label || 'How to play'
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="panel max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 my-4 sm:my-auto relative shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-stone-800 hover:bg-stone-700 text-parchment text-xl leading-none flex items-center justify-center border border-stone-700"
          aria-label="Close rules"
        >
          ×
        </button>
        <h2 className="font-display text-rune text-2xl mb-1">{title}</h2>
        <p className="text-[12px] text-slate-500 mb-4">
          {/* Named in full in the Credits modal; this line only has room for the
              nod. See docs/issues/25 for why the lineage sits on the tagline. */}
          Sigil, a roguelike deckbuilder after Scoundrel. Press <span className="font-mono text-slate-300">Esc</span> or click outside to close.
        </p>
        <RulesTabBar tab={tab} setTab={setTab} />
        {tab === 'rules' && <RulesContentFull />}
        {tab === 'boons' && <BoonsGlossary />}
        {tab === 'themes' && <ThemesGlossary />}
        {tab === 'library' && <CardLibraryContent />}
      </div>
    </div>
  )
}

// -- Rules content rows ------------------------------------------------

function RuleRow({ term, children }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-x-3 text-[13px]">
      <div className="text-rune font-semibold">{term}</div>
      <div className="text-slate-300">{children}</div>
    </div>
  )
}

function RuleSection({ title, children }) {
  return (
    <section>
      <h3 className="text-rune text-[10px] font-semibold uppercase tracking-[0.25em] mb-1.5 pb-1 border-b border-stone-800">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  )
}

// Compact rules grid shown inline on the opening sanctuary visit.
// Scannable at a glance so a first-time player can start without
// opening the modal. The full long-form rules (worked example,
// fleeing tactics, sanctuary loop) live in RulesContentFull behind
// the top-bar "How to play" button.
function RulesContentBrief() {
  return (
    <div className="text-[13px] leading-snug">
      <div className="mb-4 rounded-md border border-rune/20 bg-stone-900/40 p-3">
        <div className="text-rune text-[11px] font-semibold uppercase tracking-[0.2em] mb-1.5">The run</div>
        <p className="text-slate-300">
          Survive a descent to earn a <span className="text-rune">sigil</span> and rest to full. Each time you return you pick one <span className="text-rune">Boon</span> (a permanent perk) and <span className="text-rune">Forge</span> your kit. You descend blind: the <span className="text-rune">Trial</span> below is named as you arrive, never before, so build for anything rather than for one known threat. Reach <span className="text-rune">{SIGIL_TARGET} sigils</span> to escape. Die in the dungeon and the run resets.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <RuleSection title="The deck">
          <RuleRow term="Kit + dungeon">Each descent shuffles your kit (weapons ♦ and potions ♥) together with the dungeon's monsters (♣ ♠) into one deck.</RuleRow>
          <RuleRow term="Ranks">Tools run 2–10, no ♥/♦ face cards. Monsters run 2 to Ace: J = 11, Q = 12, K = 13, A = 14.</RuleRow>
          <RuleRow term="♥ Potion"><span className="text-slate-500">Heals HP = rank.</span> First potion per room heals; extras are wasted.</RuleRow>
          <RuleRow term="♦ Weapon"><span className="text-slate-500">Equips it.</span> Replaces your current weapon.</RuleRow>
          <RuleRow term="♣ ♠ Monster"><span className="text-slate-500">Fight it.</span> Click to swing; "Bare hands" forces a bare-handed fight.</RuleRow>
        </RuleSection>

        <RuleSection title="Rooms">
          <RuleRow term="Each room">4 cards. Play <span className="text-parchment font-semibold">3 of them</span> in any order, then the room refills.</RuleRow>
          <RuleRow term="Flee">All 4 cards to the bottom, deal a fresh 4. Can't flee twice in a row.</RuleRow>
        </RuleSection>

        <RuleSection title="Damage">
          <RuleRow term="With weapon"> Damage taken = (monster rank − weapon rank)</RuleRow>
          <RuleRow term="Bare hands">Damage taken = monster rank</RuleRow>
        </RuleSection>

        <RuleSection title="Weapon binding">
          <RuleRow term="Fresh">Can swing at any monster.</RuleRow>
          <RuleRow term="After a kill">Binds to that rank. Above bound rank?: must <span className="text-rune">Bare hands</span>.</RuleRow>
          <RuleRow term="New weapon">Replaces current weapon and binding resets.</RuleRow>
        </RuleSection>
      </div>
    </div>
  )
}

// Long-form rules with worked example, fleeing tactics, weapon
// binding nuance, and the sanctuary loop. Surfaced by the top-bar
// "How to play" button. Single column for a smooth reading flow.
function RulesContentFull() {
  return (
    <div className="space-y-5 text-[13px] leading-snug">
      <p className="text-slate-300">
        Earn <span className="text-rune font-semibold">{SIGIL_TARGET} sigils</span> (one per successful
        descent) to escape the hold. Die in the dungeon and the run ends.
      </p>

      <RuleSection title="The deck">
        <RuleRow term="Kit + dungeon">Each descent shuffles your kit (the weapons ♦ and potions ♥ you own and forge) with the dungeon's monsters (♣ ♠) into one deck. You author your tools; the dungeon authors the threats.</RuleRow>
        <RuleRow term="Ranks">Your tools run 2–10: no king-weapons, no queen-potions in this hold. Monsters run 2 to Ace (J = 11, Q = 12, K = 13, A = 14).</RuleRow>
      </RuleSection>

      <RuleSection title="The cards">
        <RuleRow term="♥ Potion"><span className="text-slate-500">Heals HP = rank.</span> Only the first potion per room heals; extras are wasted.</RuleRow>
        <RuleRow term="♦ Weapon"><span className="text-slate-500">Equips it.</span> Replaces your current weapon. The old one is gone.</RuleRow>
        <RuleRow term="♣ ♠ Monster"><span className="text-slate-500">Fight it.</span> Click the card to swing your weapon (when usable); the "Bare hands" button below forces a bare-handed fight.</RuleRow>
      </RuleSection>

      <RuleSection title="How the room flows: three of four">
        <p className="text-slate-300">
          A room is 4 cards. You play <span className="text-parchment font-semibold">three of them</span> (any order, any kind), then the room refills.
        </p>
        <p className="text-slate-400 text-[12px] mt-2">
          The fourth card, the one you didn't play, <span className="text-parchment">stays for the next room</span>. Every room you see is one card you've already met plus three fresh draws. That carry-over is your only handle on dungeon order: leave the easy fight for later, leave the heavy spade for your next weapon, leave the potion to soak a bad room with.
        </p>
      </RuleSection>

      <RuleSection title="Fleeing">
        <p className="text-slate-300">
          The <span className="text-rune">Flee the room</span> button sends all 4 cards to the
          bottom of the deck and deals a fresh four from the top. You take no damage, but
          you'll see those cards again later, hopefully when you're better equipped.
        </p>
        <p className="text-slate-400 text-[12px] mt-2">
          Catch: you can't flee twice in a row. After a flee, you have to clear a fresh room
          (down to one card) before the Flee button re-arms. Flee early, before a room damages you. Once it has, the damage is already paid.
        </p>
      </RuleSection>

      <RuleSection title="Damage">
        <RuleRow term="With weapon"><span className="font-mono text-slate-300">max(0, monster rank − weapon rank)</span></RuleRow>
        <RuleRow term="Bare hands">Full monster rank, straight to your HP.</RuleRow>
      </RuleSection>

      <RuleSection title="Weapon binding">
        <p className="text-slate-300">
          A fresh weapon swings at any monster. After a kill, the weapon
          <span className="text-parchment"> binds</span>: it'll only swing at monsters of equal
          or lower rank afterwards. Above the binding, the card-click is locked: your only
          option is <span className="text-rune">"Bare hands"</span>, taking the full rank.
          Taking up a new weapon resets the binding.
        </p>

        <div className="mt-3 panel p-3 text-[12px] space-y-2">
          <div className="text-rune text-[10px] uppercase tracking-[0.2em]">Worked example</div>
          <div className="text-slate-300">
            Take up a <span className="font-mono text-parchment">7♦</span>. Fresh weapon, swings at any monster.
          </div>
          <div className="text-slate-300">
            Fight a <span className="font-mono text-parchment">9♠</span>. You swing, take <span className="font-mono">9 − 7 = 2</span> damage. The weapon binds: rank <span className="font-mono">9</span> or lower from now on.
          </div>
          <div className="text-slate-300">
            Next room: a <span className="font-mono text-parchment">10♣</span>. Card-click is locked. Your options: Bare hands (eat 10), or take up a new weapon, or flee.
          </div>
          <div className="text-slate-300">
            You take up an <span className="font-mono text-parchment">8♦</span>. Binding resets: fresh weapon again, swings at any monster until its first kill.
          </div>
        </div>

        <p className="text-slate-400 text-[12px] mt-2">
          Sometimes "Bare hands" is the right call even when you could swing. Eat a mid-rank
          monster to keep the weapon's binding clean for the king you can see waiting in the room.
        </p>
      </RuleSection>

      <RuleSection title="Win / lose">
        <RuleRow term="Win">Empty the deck → +1 sigil → back to the Sanctuary.</RuleRow>
        <RuleRow term="Lose">HP hits 0 → the run ends. Boons, Forge edits, and sigils all reset.</RuleRow>
      </RuleSection>

      <RuleSection title="Between descents: the Sanctuary">
        <RuleRow term="HP">Refills to full.</RuleRow>
        <RuleRow term="Boon">Pick 1 of 3. Permanent for the run.</RuleRow>
        <RuleRow term="Trial">Not shown here. You descend blind and the Trial is named as you arrive, so your kit is a standing answer, not a counter.</RuleRow>
        <RuleRow term="Forge">After each descent: Add, Upgrade, or Remove a kit card. The offer varies. Permanent.</RuleRow>
        <RuleRow term="Weapon">Carries over, arrives rested (binding cleared).</RuleRow>
      </RuleSection>
    </div>
  )
}

// -- Glossaries --------------------------------------------------------

const BOON_TAG_META = {
  combat: { label: 'Combat', blurb: 'Deal more, take less.' },
  survival: { label: 'Survival', blurb: 'HP and safety nets.' },
  economy: { label: 'Economy', blurb: 'Potions, fleeing, deck efficiency.' },
  build: { label: 'Build-defining', blurb: 'Big rule-bending effects.' },
}
const BOON_TAG_ORDER = ['combat', 'survival', 'economy', 'build']

function BoonsGlossary() {
  const byTag = {}
  for (const id of Object.keys(BOONS)) {
    const b = BOONS[id]
    if (b.disabled) continue
    const tag = b.tag || 'misc'
    if (!byTag[tag]) byTag[tag] = []
    byTag[tag].push(b)
  }
  return (
    <div className="space-y-5 text-[13px] leading-snug">
      <p className="text-slate-400">
        Pick 1 of 3 each sanctuary visit. Permanent for the run. Draw biases toward
        tags you've taken less.
      </p>
      {BOON_TAG_ORDER.map(tag => byTag[tag] && (
        <section key={tag}>
          <div className="flex items-baseline gap-2 mb-2 pb-1 border-b border-stone-800 flex-wrap">
            <h3 className="text-rune text-[11px] font-semibold uppercase tracking-[0.2em]">
              {BOON_TAG_META[tag].label}
            </h3>
            <span className="text-[11px] text-slate-500">{BOON_TAG_META[tag].blurb}</span>
          </div>
          <div className="space-y-2.5">
            {byTag[tag].map(b => (
              <div key={b.id} className="grid grid-cols-[8.5rem_1fr] gap-x-3">
                <div className="text-rune font-semibold">{b.name}</div>
                <div>
                  <div className="text-slate-300">{b.description}</div>
                  {b.example && (
                    <div className="text-slate-500 text-[12px] italic leading-snug mt-0.5">
                      {b.example}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// One tier per band of descents, matching the dungeon's rising monster ceiling
// (tens → jacks → queens → kings → aces). Labels escalate in intensity.
const TIER_META = {
  opening: { label: 'Descent 1 (always)', blurb: 'Friendly warm-up; first descent of every run.' },
  1: { label: 'Tier 1: Gentle', blurb: 'Extra cards stocked into the deck, at most a light twist (tens).' },
  2: { label: 'Tier 2: Light', blurb: 'Single deck bias or mild debuff (jacks).' },
  3: { label: 'Tier 3: Heavy', blurb: 'Rule changes and harder bias (queens).' },
  4: { label: 'Tier 4: Severe', blurb: 'Stronger rules that reshape the room (kings).' },
  5: { label: 'Tier 5: Lethal', blurb: 'The climax: punishing effects, sometimes two at once (aces).' },
}

function ThemesGlossary() {
  const all = getVisibleThemes()
  // Untiered also covers the tutorial, which only a first run ever plays.
  const opening = all.filter(t => !t.tier && t.id !== 'tutorial')
  const byTier = [1, 2, 3, 4, 5].map(n => all.filter(t => t.tier === n))
  const deeperEmpty = byTier.slice(1).every(group => group.length === 0)
  return (
    <div className="space-y-5 text-[13px] leading-snug">
      <p className="text-slate-400">
        One Trial per descent: a deck or rule mutation just for that descent.
        You never see which one you drew until you are standing in it, so
        Boons and kit are built for resilience rather than as counterplay.
      </p>

      <ThemeSection meta={TIER_META.opening} themes={opening} />
      {byTier.map((themes, i) => (
        themes.length > 0 && <ThemeSection key={i + 1} meta={TIER_META[i + 1]} themes={themes} />
      ))}

      {deeperEmpty && (
        <p className="text-[11px] text-slate-500 italic">
          Heavier tiers arrive as the dungeon deepens.
        </p>
      )}
    </div>
  )
}

function ThemeSection({ meta, themes }) {
  if (!themes || themes.length === 0) return null
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2 pb-1 border-b border-stone-800 flex-wrap">
        <h3 className="text-rune text-[11px] font-semibold uppercase tracking-[0.2em]">{meta.label}</h3>
        <span className="text-[11px] text-slate-500">{meta.blurb}</span>
      </div>
      <div className="space-y-1.5">
        {themes.map(t => (
          <div key={t.id} className="grid grid-cols-[8.5rem_1fr] gap-x-3">
            <div className="text-rune font-semibold">{t.name}</div>
            <div className="text-slate-300">{t.description}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
