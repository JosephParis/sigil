# Mobile UI Improvements - Compact Gameplay View

## What Changed

The mobile gameplay view has been redesigned to eliminate scrolling during core gameplay. On small screens, only essential information is shown, with everything else accessible through modals.

## Mobile Layout (Small Screens)

### Visible at All Times:
1. **Theme Name** - Shows which descent you're in
2. **HP Bar** - Your current health (most critical stat)
3. **Compact Stats Row**:
   - Sigils earned/target
   - Weapon rank and binding status
4. **"Kit" Button** - Opens modal with full details

### Hidden in Kit Modal:
- Affliction badges
- Full weapon details
- Conditions panel
- Ascension badge
- Mode badge
- Combat log

### Still Visible:
- The room (4-5 cards)
- Flee button
- Deck count
- Foresight panel

## Desktop Layout (Medium+ Screens)

No changes! The full sidebar layout with all information visible remains on desktop screens.

## Files Modified

### New Files:
1. **`src/games/scoundrel/components/KitModal.jsx`**
   - New modal component that shows full kit details
   - Includes weapon, conditions, badges, and log
   - Closes with Escape key or clicking outside

### Modified Files:
1. **`src/games/scoundrel/components/DescentView.jsx`**
   - Added `kitOpen` state for modal
   - Created compact mobile header (shows only on `md:hidden`)
   - Wrapped PhaseRail in `hidden md:block` div
   - Added Escape key handler for kit modal

## How It Works

### Responsive Breakpoint
- **Mobile (< 768px)**: Shows compact header + Kit button
- **Desktop (≥ 768px)**: Shows full PhaseRail sidebar

### Mobile Header Components
```
┌─────────────────────────────────┐
│ Theme Name            [Kit]     │  ← Title + Kit button
├─────────────────────────────────┤
│ ████████░░░░░░░ 16/20 HP        │  ← HP bar
├─────────────────────────────────┤
│ Sigils: 2/3    Weapon: 8 (6)    │  ← Quick stats
└─────────────────────────────────┘
```

### Kit Modal Contents
When you tap "Kit", you see:
- All affliction badges
- Full weapon panel with details
- Conditions panel
- Ascension level
- Mode badge
- Complete combat log

## Benefits

### ✅ No More Scrolling During Gameplay
- All essential info fits on screen
- Room cards always visible
- Can play entire game without scrolling

### ✅ Focus on What Matters
- HP and weapon are the most important stats
- Everything else available on-demand
- Cleaner, less cluttered interface

### ✅ Desktop Experience Unchanged
- Full sidebar still shows on larger screens
- No functionality removed
- Existing desktop workflow preserved

## Testing Checklist

### Mobile (iPhone SE, 375×667)
- [ ] Compact header shows at top
- [ ] HP bar visible
- [ ] Sigils and weapon info shown
- [ ] "Kit" button in top-right
- [ ] PhaseRail sidebar hidden
- [ ] Room cards fully visible without scrolling
- [ ] Tapping "Kit" opens modal
- [ ] Modal shows all equipment/status
- [ ] Escape key closes modal
- [ ] Clicking outside modal closes it

### Desktop (1920×1080)
- [ ] Compact header hidden
- [ ] Full PhaseRail sidebar visible
- [ ] "Kit" button not shown
- [ ] Layout unchanged from before

### Gameplay Flow
- [ ] Can play entire descent without scrolling on mobile
- [ ] All info accessible when needed
- [ ] Modal doesn't interfere with gameplay
- [ ] Keyboard shortcuts work (Escape to close)

## Future Enhancements (Optional)

### Possible Additions:
1. **Badge on Kit Button** - Show count of active conditions/afflictions
2. **Swipe Gestures** - Swipe from left to open kit modal
3. **Quick HP Preview** - Tap HP bar to see detailed breakdown
4. **Notification Dots** - Visual indicator when new log entries appear

### Not Recommended:
- Don't hide the HP bar (always critical)
- Don't hide room cards (core gameplay)
- Don't auto-open kit modal (should be user-initiated)

## Code Architecture

### Component Hierarchy
```
DescentView
├─ Mobile Compact Header (md:hidden)
│  ├─ Title + Kit Button
│  ├─ HP Bar
│  └─ Quick Stats Row
├─ KitModal (controlled by kitOpen state)
│  ├─ AfflictionBadges
│  ├─ WeaponPanel
│  ├─ ConditionsPanel
│  ├─ AscensionBadge
│  ├─ ModeBadge
│  └─ LogPanel
└─ Desktop Grid (hidden md:block)
   ├─ PhaseRail (full sidebar)
   └─ Room + Cards
```

### State Management
- `kitOpen` - Boolean state for modal visibility
- Escape key listener for modal close
- Click-outside handler via onClick on backdrop

## Migration Notes

### Breaking Changes
None! This is purely additive:
- Desktop layout unchanged
- All functionality preserved
- Same component props

### Accessibility
- Kit button has `aria-label="View kit"`
- Modal close button has `aria-label="Close kit"`
- Escape key support matches other modals
- Focus management handled by React

## Performance

### Impact
Minimal - only adds:
- One button component on mobile
- One modal component (rendered conditionally)
- One boolean state variable
- One event listener (Escape key)

### Bundle Size
- KitModal.jsx: ~1KB
- DescentView changes: ~500 bytes

Total increase: ~1.5KB uncompressed
