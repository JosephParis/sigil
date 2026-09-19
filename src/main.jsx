/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { PostHogContext } from '@posthog/react'
import './index.css'
import App from './App.jsx'
import VersionBadge from './VersionBadge.jsx'
import { ErrorBoundary } from './ErrorBoundary.jsx'
import EmbeddedStage from './EmbeddedStage.jsx'
import { IS_STANDALONE } from './buildTarget.js'

// A history router needs the game to be at a known path and needs the server to
// rewrite unknown ones to index.html. The standalone build has neither: it is
// served from /html/<id>/ on a portal that knows nothing about these routes, so
// "/" would match nothing and the app would render its catch-all forever.
// Hash routing owns everything after the '#', which no host can get wrong.
const Router = IS_STANDALONE ? HashRouter : BrowserRouter

// Marks the document for the embedded-layout rules in index.css. Set here
// rather than in the HTML so the two builds keep sharing one index.html, and
// set before render so the first paint already has the right scroll model.
if (IS_STANDALONE) document.documentElement.classList.add('embedded')

// Scale-to-fit, and only where a frame makes it necessary. On the site the app
// is rendered with no wrapper at all rather than a pass-through one, so there
// is no stacking or containing-block context here that does not exist there.
const Stage = IS_STANDALONE ? EmbeddedStage : ({ children }) => children

// PostHog SDK is heavy. Defer its import past window.load + idle so it doesn't
// compete with LCP. Children mount immediately; usePostHog consumers no-op
// safely while client is null.
const POSTHOG_TOKEN = import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN
const POSTHOG_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

function Root() {
  const [posthogClient, setPosthogClient] = useState(null)

  useEffect(() => {
    // Standalone opts out: those sessions cannot reach the API, so they would
    // arrive as a population with no runs, no leaderboard and no sign-in, and
    // quietly skew every funnel the product analytics exist to measure.
    if (!POSTHOG_TOKEN || IS_STANDALONE) return
    let cancelled = false
    let idleHandle
    let timeoutHandle

    const load = async () => {
      const { default: posthog } = await import('posthog-js')
      if (cancelled) return
      posthog.init(POSTHOG_TOKEN, {
        api_host: POSTHOG_HOST,
        defaults: '2026-01-30',
        person_profiles: 'identified_only',
      })
      setPosthogClient(posthog)
    }

    const schedule = () => {
      if (cancelled) return
      if (typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(load, { timeout: 5000 })
      } else {
        timeoutHandle = setTimeout(load, 1500)
      }
    }

    if (document.readyState === 'complete') {
      schedule()
    } else {
      window.addEventListener('load', schedule, { once: true })
    }

    return () => {
      cancelled = true
      window.removeEventListener('load', schedule)
      if (idleHandle != null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle)
      }
      if (timeoutHandle != null) clearTimeout(timeoutHandle)
    }
  }, [])

  return (
    <PostHogContext.Provider value={{ client: posthogClient }}>
      {/* Inside the provider so crashes can be reported, and outside the router
          so it also catches a failed lazy route import -- Suspense does not.
          The stage wraps it in turn, so the crash screen is fitted to the frame
          the same way every other screen is. */}
      <Stage>
        <ErrorBoundary>
          <Router>
            <App />
          </Router>
        </ErrorBoundary>
      </Stage>
      <VersionBadge />
      {/* Vercel's beacons only report for the deployment that serves them.
          Off-platform they are dead weight and a third-party request the portal
          never asked for. */}
      {!IS_STANDALONE && <Analytics />}
      {!IS_STANDALONE && <SpeedInsights />}
    </PostHogContext.Provider>
  )
}

// The offline shell (issue 35). Production only: the worker is written by the
// build and does not exist under `vite dev`. Never in the standalone build,
// which has no sw.js either (see serviceWorker() in vite.config.js).
// Registered after load so it never competes with the first paint.
if (import.meta.env.PROD && !IS_STANDALONE && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
