# Responsive Design & PWA Installation Plan

## Part 1: Responsive Design Issues & Fixes

### Current State Analysis
- ✅ Viewport meta tag is set correctly
- ✅ Tailwind CSS responsive utilities are used (sm:, md:, etc.)
- ⚠️ Potential issues identified:
  1. Fixed grid layouts might not adapt well to all screen sizes
  2. Card sizes use fixed max-widths (240px) which might be too large on small phones
  3. Some modals might overflow on small screens
  4. The main container uses `max-w-7xl` which limits content on ultra-wide screens

### Recommended Fixes

#### 1. **Add Dynamic Viewport Height Units**
Modern mobile browsers have collapsing URL bars, which can cause layout shifts. Replace `min-h-screen` with `min-h-dvh` (dynamic viewport height).

**Files to update:**
- `src/index.css` (lines 25-28)
- `src/App.jsx` (line 23)
- `src/games/scoundrel/index.jsx` (line 446)

```css
/* Replace min-height: 100vh with: */
min-height: 100dvh;
```

#### 2. **Improve Card Responsiveness**
Make cards scale better on very small screens.

**Files to update:**
- `src/games/scoundrel/components/cardSlot.jsx` (line 166)
- `src/games/scoundrel/components/boons.jsx` (line 124)
- `src/games/scoundrel/components/forge.jsx` (line 122)

```jsx
// Current: max-w-[240px]
// Change to responsive sizing:
className="w-full max-w-[180px] sm:max-w-[220px] md:max-w-[240px]"
```

#### 3. **Add Safe Area Insets for Mobile**
Handle phone notches and home indicators.

**File:** `src/index.css`
```css
@layer base {
  body {
    /* Add padding for safe areas (notches, etc.) */
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}
```

#### 4. **Fix Modal Overflow on Small Screens**
Ensure all modals are scrollable and fit on small screens.

**Pattern to apply to all modals:**
```jsx
<div className="fixed inset-0 overflow-y-auto">
  <div className="min-h-full flex items-center justify-center p-4">
    <div className="panel max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      {/* modal content */}
    </div>
  </div>
</div>
```

#### 5. **Improve Touch Targets**
Make buttons and interactive elements larger on mobile (minimum 44x44px).

**File:** `src/index.css`
```css
@layer base {
  @media (pointer: coarse) {
    button, a {
      min-height: 44px;
      min-width: 44px;
    }
  }
}
```

#### 6. **Add Landscape Mode Handling**
Detect and optimize for landscape orientation on mobile.

**File:** `src/index.css`
```css
@media (max-height: 500px) and (orientation: landscape) {
  /* Adjust spacing for landscape mobile */
  .panel {
    padding: 0.75rem !important;
  }
}
```

---

## Part 2: Progressive Web App (PWA) Setup

### What is a PWA?
A PWA allows users to:
- Install the app on their home screen (mobile & desktop)
- Use it offline (optional)
- Get an app-like experience with no browser chrome
- Receive push notifications (optional)

### Implementation Steps

#### 1. **Install PWA Plugin**
```bash
npm install -D vite-plugin-pwa
```

#### 2. **Create Web App Manifest**
**File:** `public/manifest.json`
```json
{
  "name": "Scoundrel",
  "short_name": "Scoundrel",
  "description": "A roguelike deckbuilder card game",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0b0d12",
  "theme_color": "#1e293b",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-152x152.png",
      "sizes": "152x152",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-384x384.png",
      "sizes": "384x384",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-maskable-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "categories": ["games", "entertainment"],
  "screenshots": [
    {
      "src": "/screenshots/gameplay-narrow.png",
      "sizes": "540x720",
      "type": "image/png",
      "form_factor": "narrow"
    },
    {
      "src": "/screenshots/gameplay-wide.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide"
    }
  ]
}
```

#### 3. **Update Vite Config**
**File:** `vite.config.js`
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// ... existing gitShort function and build vars ...

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'audio/**/*'],
      manifest: {
        name: 'Scoundrel',
        short_name: 'Scoundrel',
        description: 'A roguelike deckbuilder card game',
        theme_color: '#1e293b',
        background_color: '#0b0d12',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/icon-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icons/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Cache audio files for offline play
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,mp3}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true // Enable PWA in dev mode for testing
      }
    })
  ],
  // ... rest of existing config ...
})
```

#### 4. **Update index.html**
**File:** `index.html`
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#1e293b" />
    <meta name="description" content="A roguelike deckbuilder card game" />
    
    <!-- PWA Meta Tags -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Scoundrel" />
    
    <!-- Apple Touch Icons -->
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16x16.png" />
    
    <!-- Manifest -->
    <link rel="manifest" href="/manifest.json" />
    
    <title>Scoundrel</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

#### 5. **Create App Icons**
You'll need to create icons in the following sizes:
- 16x16, 32x32 (favicon)
- 72x72, 96x96, 128x128, 144x144, 152x152 (various devices)
- 180x180 (Apple touch icon)
- 192x192, 384x384, 512x512 (Android)
- 192x192, 512x512 (Maskable - for Android adaptive icons)

**Icon Requirements:**
- PNG format
- Transparent background (except maskable)
- Maskable icons should have important content in the center "safe zone" (80% of total size)
- Store in `public/icons/` directory

**Tool Recommendations:**
- Use https://realfavicongenerator.net/ to generate all sizes
- Or use https://www.pwabuilder.com/ for PWA assets

#### 6. **Add Install Prompt (Optional)**
**File:** `src/components/InstallPrompt.jsx`
```jsx
import { useState, useEffect } from 'react'

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstall, setShowInstall] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstall(true)
    }
    
    window.addEventListener('beforeinstallprompt', handler)
    
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
      setShowInstall(false)
    }
  }

  if (!showInstall) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50">
      <div className="panel p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="font-display text-rune text-sm mb-1">Install Scoundrel</h3>
            <p className="text-xs text-slate-400">
              Install the app for a better experience
            </p>
          </div>
          <button
            onClick={() => setShowInstall(false)}
            className="text-slate-500 hover:text-slate-300"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleInstall}
            className="flex-1 px-4 py-2 bg-rune text-dungeon rounded font-semibold text-sm hover:bg-rune/90 transition"
          >
            Install
          </button>
          <button
            onClick={() => setShowInstall(false)}
            className="px-4 py-2 text-slate-400 hover:text-slate-300 text-sm transition"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
```

---

## Part 3: Testing Checklist

### Responsive Design Testing

**Mobile (Portrait)**
- [ ] iPhone SE (375×667)
- [ ] iPhone 12/13/14 (390×844)
- [ ] iPhone 14 Pro Max (430×932)
- [ ] Android Small (360×640)
- [ ] Android Medium (412×915)

**Mobile (Landscape)**
- [ ] Test at 667×375 and similar

**Tablet**
- [ ] iPad Mini (768×1024)
- [ ] iPad Pro (1024×1366)

**Desktop**
- [ ] 1366×768 (common laptop)
- [ ] 1920×1080 (Full HD)
- [ ] 2560×1440 (QHD)
- [ ] 3840×2160 (4K)

**Test Cases:**
- [ ] All cards visible without horizontal scroll
- [ ] Modals fit on screen
- [ ] Touch targets are at least 44×44px on mobile
- [ ] No content cut off at edges
- [ ] Safe areas respected (notches, etc.)
- [ ] Landscape mode works on mobile

### PWA Installation Testing

**Desktop (Chrome/Edge)**
- [ ] Install button appears in address bar
- [ ] App installs successfully
- [ ] App opens in standalone window
- [ ] App icon appears in Start Menu/Applications

**Android**
- [ ] "Add to Home Screen" prompt appears
- [ ] App installs successfully
- [ ] Splash screen shows correctly
- [ ] App runs in fullscreen
- [ ] App icon appears on home screen
- [ ] Adaptive icon displays correctly

**iOS/iPadOS (Safari)**
- [ ] Share → Add to Home Screen works
- [ ] App icon appears on home screen
- [ ] App runs in fullscreen
- [ ] Status bar styling is correct

**Offline Functionality**
- [ ] Game state persists offline
- [ ] Audio files cached (if enabled)
- [ ] App loads without network

---

## Implementation Priority

### Phase 1: Critical Responsive Fixes (High Priority)
1. Add dynamic viewport height units
2. Fix card sizing for small screens
3. Add safe area insets
4. Test on real mobile devices

### Phase 2: PWA Basic Setup (High Priority)
1. Install vite-plugin-pwa
2. Create app icons (start with basic sizes)
3. Update vite.config.js
4. Update index.html
5. Test installation on one platform

### Phase 3: PWA Polish (Medium Priority)
1. Create all icon sizes including maskable
2. Add install prompt component
3. Add screenshots to manifest
4. Test on all platforms

### Phase 4: Optimization (Low Priority)
1. Optimize offline caching strategy
2. Add update notifications
3. Performance testing
4. Add landscape mode optimizations

---

## Quick Start Commands

```bash
# Install PWA plugin
npm install -D vite-plugin-pwa

# Test PWA in dev mode
npm run dev
# Then open DevTools → Application → Manifest

# Build for production
npm run build

# Preview production build with PWA
npm run preview
# Test installation from this preview
```

---

## Resources

- [PWA Builder](https://www.pwabuilder.com/) - Generate PWA assets
- [Favicon Generator](https://realfavicongenerator.net/) - Create all icon sizes
- [Web.dev PWA Guide](https://web.dev/progressive-web-apps/)
- [Can I Use - PWA](https://caniuse.com/?search=pwa)
- [Tailwind Responsive Design](https://tailwindcss.com/docs/responsive-design)
