import { useEffect, useState } from 'react'

/**
 * A coarse ticking clock for relative timestamps ("4 min ago").
 *
 * Returns a `Date` on every render, never `null`, so callers can pass it
 * straight into a formatter without a `?? new Date()` fallback — that fallback
 * would be an impure call during render, which React is right to warn about.
 *
 * The value only advances on the interval, and it starts from the moment the
 * component mounted, so the first paint is stable and hydration-safe.
 */
export function useLiveClock(interval = 15000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), interval)
    return () => window.clearInterval(id)
  }, [interval])

  return now
}
