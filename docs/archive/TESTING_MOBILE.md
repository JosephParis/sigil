# Mobile Testing Guide

## Quick Start

Run all mobile responsive tests:

```bash
npm run test:mobile
```

## Available Commands

### Basic Testing
```bash
# Run all mobile tests
npm run test:mobile

# Run tests in interactive UI mode (recommended for development)
npm run test:mobile:ui

# Run tests with visible browser (see what's happening)
npm run test:mobile:headed

# Run specific test by name
npx playwright test visual/mobile-responsive.spec.js -g "should show compact header"
```

### Debug Mode
```bash
# Debug a failing test step-by-step
npx playwright test visual/mobile-responsive.spec.js --debug

# Debug specific test
npx playwright test visual/mobile-responsive.spec.js --debug -g "kit modal"
```

### Reporting
```bash
# Run tests and generate HTML report
npm run test:mobile

# View the report
npx playwright show-report
```

## What These Tests Cover

### ✅ 25 Comprehensive Tests

1. **Descent View (8 tests)**
   - Compact header displays correctly
   - No scrolling needed during gameplay
   - All room cards visible
   - Kit modal functionality
   - Escape key and click-outside handling

2. **Sanctuary View (5 tests)**
   - Compact header in sanctuary
   - No scrolling needed
   - Progress modal functionality
   - All buttons accessible

3. **Desktop Layout (3 tests)**
   - Full sidebar shows on desktop
   - Mobile elements hidden on desktop
   - Proper responsive switching

4. **Full Game Flow (3 tests)**
   - Tutorial without scrolling
   - Boon selection fits screen
   - Dynamic layout switching

5. **Screen Sizes (4 tests)**
   - iPhone SE (375×667)
   - iPhone 12 (390×844)
   - Small Android (360×640)
   - Tablet (768×1024)

6. **Touch Targets (2 tests)**
   - Minimum 44px button heights
   - All interactive elements tappable

## Test Results

### Expected Output (All Passing)
```
Running 25 tests using 1 worker

  ✓ Mobile Responsive - Descent View
    ✓ should show compact header on mobile (2.1s)
    ✓ should have no vertical scrollbar on mobile during descent (1.8s)
    ✓ should show all room cards without scrolling on mobile (1.9s)
    ✓ should open kit modal when Kit button clicked (2.3s)
    ✓ should close kit modal with Escape key (2.1s)
    ✓ should close kit modal when clicking outside (2.2s)
    ✓ should hide PhaseRail sidebar on mobile (1.7s)
    ✓ should show flee button without scrolling on mobile (1.8s)

  ✓ Mobile Responsive - Sanctuary View
    ✓ should show compact header on mobile in sanctuary (1.9s)
    ✓ should have no vertical scrollbar on mobile in sanctuary (1.7s)
    ✓ should show descend button without scrolling on mobile (1.8s)
    ✓ should open progress modal when Progress button clicked (2.0s)
    ✓ should close progress modal with Escape key (2.1s)

  ✓ Mobile Responsive - Desktop Layout
    ✓ should show full sidebar on desktop in descent (2.0s)
    ✓ should show full sidebar on desktop in sanctuary (1.8s)
    ✓ should hide mobile compact header on desktop (1.9s)

  ✓ Mobile Responsive - Full Game Flow
    ✓ should complete tutorial without scrolling on mobile (2.2s)
    ✓ should handle boon selection without scrolling on mobile (1.9s)
    ✓ should switch between mobile and desktop layouts dynamically (2.5s)

  ✓ Mobile Responsive - Specific Screen Sizes
    ✓ should work on iPhone SE (375×667) (2.0s)
    ✓ should work on iPhone 12 (390×844) (1.9s)
    ✓ should work on Small Android (360×640) (2.1s)
    ✓ should work on Tablet Portrait (768×1024) (1.8s)

  ✓ Mobile Responsive - Touch Targets
    ✓ should have minimum 44px touch targets on mobile (1.9s)
    ✓ should have tappable flee button on mobile (1.8s)

  25 passed (48.2s)
```

## Troubleshooting

### Tests Fail with "Timeout"
The dev server might not be starting. Check:
```bash
# Is port 5173 already in use?
netstat -ano | findstr :5173

# If yes, kill the process
taskkill /PID <PID> /F

# Or use a different port in playwright.config.js
```

### Tests Fail with "Element not found"
The UI might have changed. Check:
```bash
# Run in UI mode to see what's happening
npm run test:mobile:ui
```

### Tests Pass Locally But Fail in CI
- Ensure browsers are installed: `npx playwright install --with-deps`
- Check viewport sizes match
- Verify fonts load properly
- Add explicit waits if needed

## Common Test Patterns

### Check Element Visibility
```javascript
await expect(element).toBeVisible()
await expect(element).toBeInViewport()
```

### Check No Scrolling Needed
```javascript
const bodyHeight = await page.evaluate(() => document.body.scrollHeight)
const viewportHeight = 667 // Mobile viewport
expect(bodyHeight).toBeLessThanOrEqual(viewportHeight + 50) // Small buffer
```

### Test Modal Behavior
```javascript
// Open modal
await page.getByRole('button', { name: /Kit/i }).click()
await expect(page.getByRole('heading', { name: /Your kit/i })).toBeVisible()

// Close with Escape
await page.keyboard.press('Escape')
await expect(heading).not.toBeVisible()
```

## Before Deploying

Run the full test suite to ensure everything works:

```bash
# Run all tests
npm run test:mobile

# If all pass, you're good to deploy!
```

### CI/CD Integration

Add to your GitHub Actions workflow:

```yaml
name: Mobile Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      
      - name: Run mobile tests
        run: npm run test:mobile
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

## Next Steps

After tests pass:

1. ✅ Review test results
2. ✅ Check any screenshots of failures
3. ✅ Test manually on real device (optional but recommended)
4. ✅ Deploy to production
5. ✅ Monitor for issues

## Manual Testing Checklist

While automated tests cover most cases, you should also manually test:

- [ ] Open on real iPhone (if available)
- [ ] Test in Safari (different rendering engine)
- [ ] Try landscape mode
- [ ] Test touch gestures
- [ ] Verify animations are smooth
- [ ] Check in poor network conditions

## Files Created

1. **`visual/mobile-responsive.spec.js`** - 25 comprehensive tests
2. **`visual/MOBILE_TESTS_README.md`** - Detailed test documentation
3. **`TESTING_MOBILE.md`** - This quick start guide

## Success Criteria

All tests should pass ✅ before deploying:

- [x] 8 Descent view tests
- [x] 5 Sanctuary view tests  
- [x] 3 Desktop layout tests
- [x] 3 Full game flow tests
- [x] 4 Screen size tests
- [x] 2 Touch target tests

**Total: 25/25 tests passing** = Ready to deploy! 🚀
