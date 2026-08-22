# Quick Responsive Testing Guide

## Easiest Method: Chrome DevTools (2 minutes)

### Step 1: Start the dev server
```bash
cd scoundrel
npm run dev
```

### Step 2: Open in Chrome and enable Device Mode
1. Open http://localhost:5173
2. Press **F12** (or Ctrl+Shift+I)
3. Press **Ctrl+Shift+M** (or click the device icon)

### Step 3: Test these specific scenarios

#### Test 1: Small Phone (iPhone SE - 375px wide)
- **Set device:** iPhone SE
- **What to check:**
  - Cards should be smaller (180px max)
  - All 4 room cards visible without horizontal scroll
  - Buttons easy to tap (minimum 44px tall)
  - No content cut off at edges

#### Test 2: Medium Phone (iPhone 12 - 390px wide)
- **Set device:** iPhone 12 Pro
- **What to check:**
  - Cards slightly larger (220px max)
  - Layout comfortable, not cramped

#### Test 3: Desktop (1920px wide)
- **Set device:** Responsive mode, drag to ~1920px width
- **What to check:**
  - Cards at full size (240px max)
  - Good spacing, not too spread out

#### Test 4: Landscape Phone
- **Set device:** iPhone SE
- **Click rotate icon** (or Ctrl+Shift+R)
- **What to check:**
  - Reduced padding (should feel more compact)
  - Game still playable
  - No excessive scrolling

#### Test 5: Cramped Halls (5 cards)
- Start a run
- Keep descending until you get "Cramped Halls" theme (shows 5 cards)
- **What to check:**
  - All 5 cards in a single row on desktop
  - Cards wrap nicely on mobile

#### Test 6: Safe Areas (iPhone X+)
- **Set device:** iPhone 12 Pro or newer (has notch)
- **What to check:**
  - Content doesn't hide behind notch
  - Content doesn't hide behind home indicator bar at bottom

---

## If You Want to Test on Real Phone (5 minutes)

### Step 1: Find your local IP
While dev server is running, look for the "Network" line:
```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.xxx:5173/
```

Or run this command:
```bash
# Windows
ipconfig | findstr IPv4

# The IP will be something like: 192.168.1.123
```

### Step 2: Connect from phone
1. Make sure phone is on **same WiFi** as your computer
2. Open browser on phone
3. Go to `http://[your-ip]:5173` (e.g., http://192.168.1.123:5173)

### Step 3: Test the game
- Play through a few descents
- Try forge, boons, different room sizes
- Rotate to landscape
- Check if content is cut off

---

## Quick Visual Checklist

### ✅ Mobile Portrait (iPhone SE)
- [ ] Cards fit without horizontal scroll
- [ ] All buttons are tappable
- [ ] No content hidden at screen edges
- [ ] Text is readable
- [ ] Modals scroll properly

### ✅ Mobile Landscape
- [ ] Padding is reduced (more compact)
- [ ] Content doesn't require excessive scrolling
- [ ] Still playable

### ✅ Desktop
- [ ] Cards are full size
- [ ] Layout looks spacious
- [ ] Everything scales nicely

### ✅ Safe Areas (iPhone with notch)
- [ ] Nothing hidden behind notch
- [ ] Nothing hidden behind home indicator

---

## Common Issues and Fixes

### Issue: Cards still too big on small phone
**Fix:** We can reduce mobile max-width from 180px to 160px or 170px

### Issue: Buttons hard to tap on mobile
**Fix:** We can increase min-height from 44px to 48px

### Issue: Content cut off at edges
**Fix:** Check safe area insets are working, may need to adjust padding

### Issue: Cramped halls cards wrap on desktop
**Fix:** Already implemented dynamic grid, but we can adjust breakpoint if needed

---

## Time Estimate
- **Chrome DevTools testing:** 2-3 minutes
- **Real device testing:** 5 minutes (initial setup) + testing time

**Recommendation:** Start with Chrome DevTools for quick verification, then test on real phone if you have one handy for the most accurate feel.
