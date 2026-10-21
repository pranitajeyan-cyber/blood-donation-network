import type { ReactNode } from 'react'

import { Alert, Refresh } from './Icons'
import { Button } from './ui'

/**
 * The three states every data view in this app can be in.
 *
 * They exist as components rather than ad-hoc markup so that loading looks
 * the same on the donor board, the hospital inventory and the admin console —
 * and so no surface can quietly omit one.
 */

export function LoadingState({
  label = 'Loading',
  rows = 3,
}: {
  label?: string
  rows?: number
}) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="loading__bars" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div className="loading__row" key={index}>
            <span className="loading__dot" />
            <span className="loading__bar" style={{ animationDelay: `${index * 90}ms` }} />
          </div>
        ))}
      </div>
      <p className="loading__label">{label}</p>
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  compact = false,
}: {
  message: string
  onRetry?: () => void
  compact?: boolean
}) {
  return (
    <div className={`error-state ${compact ? 'error-state--compact' : ''}`} role="alert">
      <span className="error-state__icon">
        <Alert size={compact ? 16 : 20} />
      </span>
      <div className="error-state__body">
        <p className="error-state__title">
          {compact ? 'Could not load' : 'Something went wrong'}
        </p>
        <p className="error-state__message">{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="ghost" icon={<Refresh size={15} />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

/** A slim strip shown while background data refreshes over existing content. */
export function RefreshingBar({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div className="refreshing" role="status">
      <span className="refreshing__dot" aria-hidden="true" />
      <span>Refreshing</span>
    </div>
  )
}

export function InlineNotice({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger'
  children: ReactNode
}) {
  return (
    <p className={`inline-notice inline-notice--${tone}`} role="status">
      {children}
    </p>
  )
}
