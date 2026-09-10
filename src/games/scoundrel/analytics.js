/**
 * Edge-detecting PostHog analytics for a Scoundrel run.
 *
 * `useRunAnalytics(game, user)` watches the single game-state object and the
 * signed-in user and emits events at run/descent boundaries. It is purely an
 * observer: nothing here mutates game state, and every emission is best-effort
 * wrapped in try/catch so analytics can never break play.
 *
 * The PostHog client is deferred past window.load in main.jsx, so usePostHog()
 * returns null for the first stretch of a session. Events fired in that window
 * are buffered and flushed once the client appears.
 *
 * What gets sent, and when, is decided in analyticsEvents.js -- the event list
 * is there. This file only wires it to React and the PostHog client.
 */

import { useEffect, useRef } from 'react'
import { usePostHog } from '@posthog/react'
import { pseudonymFor } from '../../utils/pseudonym'
import { createTracker, observe, abandonEvent } from './analyticsEvents'

export function useRunAnalytics(game, user) {
  const posthog = usePostHog()

  const pending = useRef([])
  const tracker = useRef(null)
  if (tracker.current === null) tracker.current = createTracker()
  const identified = useRef(null)

  // Latest game/client, read by the visibility listener (which is registered
  // once and must not close over a stale render). Kept current via the effect
  // below rather than mutated during render.
  const gameRef = useRef(game)
  const posthogRef = useRef(posthog)
  useEffect(() => {
    gameRef.current = game
    posthogRef.current = posthog
  })

  // Send now, or buffer until the deferred client loads.
  const capture = (event, props) => {
    if (posthog) {
      try { posthog.capture(event, props) } catch { /* never break play */ }
    } else {
      pending.current.push([event, props])
    }
  }

  // Flush whatever queued before the client was ready.
  useEffect(() => {
    if (!posthog || pending.current.length === 0) return
    const queued = pending.current
    pending.current = []
    for (const [event, props] of queued) {
      try { posthog.capture(event, props) } catch { /* ignore */ }
    }
  }, [posthog])

  // Mid-run abandon: when the tab is hidden during a live run, record it once
  // as a behavioral signal. abandonEvent decides whether this one counts.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState !== 'hidden') return
      const ev = abandonEvent(tracker.current, gameRef.current)
      const ph = posthogRef.current
      if (!ev || !ph) return
      try { ph.capture(ev[0], ev[1]) } catch { /* never break play */ }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  // Tie a signed-in player's events to one person profile; reset on sign-out.
  //
  // No email and no display name: the only identity sent is the Google `sub`,
  // which is opaque and application-scoped, so PostHog holds nothing that
  // identifies a person (issue 06). `pseudonym` is derived from that same id and
  // exists only so the PostHog UI is readable; it reveals nothing. Keeping `sub`
  // as the distinct_id also lets events be joined to the `runs` table, which
  // keys on the same value.
  useEffect(() => {
    if (!posthog) return
    try {
      if (user?.sub && identified.current !== user.sub) {
        posthog.identify(user.sub, { pseudonym: pseudonymFor(user.sub) })
        identified.current = user.sub
      } else if (!user?.sub && identified.current) {
        posthog.reset()
        identified.current = null
      }
    } catch { /* ignore */ }
  }, [posthog, user])

  useEffect(() => {
    let events = []
    try { events = observe(tracker.current, game, user) } catch { /* never break play */ }
    for (const [event, props] of events) capture(event, props)
    // posthog intentionally omitted: capture() buffers without it, and the
    // flush effect drains the queue when it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, user])
}
