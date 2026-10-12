---
id: 17
title: "No prefers-reduced-motion support despite ~20 animations, 4 of them infinite"
priority: P3
area: accessibility
effort: S
status: done
---

## Problem

`src/index.css` defines roughly 20 keyframe animations with no
`prefers-reduced-motion` block anywhere in the codebase. Four run indefinitely:

- `runePulse`
- `criticalPulse`
- `cardBossGlow`
- `tutorialPulse`

Infinite animations are the specific case the media query exists for. For users
with vestibular disorders or motion sensitivity they range from distracting to
genuinely nauseating, and `criticalPulse` fires exactly when the player is at low
HP and needs to concentrate.

## Why it matters

- It's a real accessibility barrier, and the fix is one CSS block.
- The OS-level setting is already on for these users — they've told the browser
  what they need, and the app ignores it.
- Continuous animation on mobile also costs battery and can cause dropped frames
  on low-end devices, which interacts with the Speed Insights numbers you're
  collecting.

## Suggested fix

Add to `src/index.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

That's the blunt version and it's a legitimate baseline. Then refine: some
animations carry *information* rather than decoration, and killing them outright
loses meaning. Specifically —

- **`criticalPulse`** signals low HP. Replace the pulse with a static high-contrast
  border or a persistent text indicator so the warning survives.
- **`cardBossGlow`** marks a boss card. Needs a static equivalent — a border
  treatment or an icon.
- **`tutorialPulse`** directs attention to the next action. Under reduced motion
  this needs a static highlight, or the tutorial becomes hard to follow.
- **`runePulse`** appears decorative; safe to disable outright.

Card deal/flip transitions are also worth keeping in some form, since they
communicate game state changes — consider shortening rather than removing.

Test by enabling reduced motion at the OS level (Windows: Settings → Accessibility
→ Visual effects → Animation effects off) and playing a full run, confirming
nothing important became invisible.

## Acceptance criteria

- [x] `prefers-reduced-motion: reduce` block present in `src/index.css`
- [x] All four infinite animations stop under the setting
- [x] Low HP, boss cards, and tutorial focus remain clearly indicated without motion
- [x] A full run is playable and comprehensible with reduced motion enabled

## Resolution (2026-09-23)

The blunt block from the suggested fix is at the end of `src/index.css`, with
durations at 0.01ms rather than `animation: none`, because the HP flash, weapon
snap and sigil flourish each clear their own state on `animationend`; with no
animation that event never fires and the red HP overlay would stay up.

Three exemptions and four static stand-ins sit inside the same block:

- **HP flash** keeps its 0.45s fade. It is a color change, not movement, and it
  is how damage versus healing reads.
- **`animate-spin`** keeps spinning. A frozen loading spinner looks like a hang.
- **`criticalPulse`** is held at its brightest glow plus a pale ring.
- **`cardBossGlow`** is held at its peak glow plus a 2px gold ring.
- **`tutorialPulse`** is held as a full-strength 3px ring.
- **`runePulse`** is held at rest (decorative).

The tutorial's bouncing arrow stops in place and stays visible.

Tests: `visual/reduced-motion.spec.js` asserts, under emulated reduced motion,
that the critical HP bar, boss card, rune pulse and tutorial cue each stop and
keep a non-empty box-shadow, that nothing else in a seeded room is still looping,
and that without the setting the pulse still runs. `tutorial-walkthrough.spec.js`
now plays the whole curated walk twice, once with reduced motion on, and must
reach the win both times. That walk is the "full run playable" criterion; a
manual pass with the Windows setting was not done.
