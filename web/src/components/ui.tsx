import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { useId } from 'react'

/* ==========================================================================
   Button
   ========================================================================== */

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  busy?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'outline',
  size = 'md',
  busy = false,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn--${variant} btn--${size} ${busy ? 'is-busy' : ''} ${className}`}
      disabled={disabled || busy}
      {...rest}
    >
      {busy ? <span className="btn__spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  )
}

/* ==========================================================================
   Form field
   ========================================================================== */

interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string | null
  children: (props: { id: string; describedBy: string | undefined }) => ReactNode
}

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({ id, describedBy })}
      {hint && !error && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="select-wrap">
      <select {...props} className={`input select ${props.className ?? ''}`} />
      <svg className="select__chevron" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="M2.5 4.5 6 8l3.5-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input textarea ${props.className ?? ''}`} />
}

/* ==========================================================================
   Toggle
   ========================================================================== */

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__knob" />
    </button>
  )
}

/* ==========================================================================
   Segmented control
   ========================================================================== */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={`segmented__item ${option.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/* ==========================================================================
   Badge
   ========================================================================== */

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'cool'

export function Badge({
  tone = 'neutral',
  children,
  dot = false,
}: {
  tone?: Tone
  children: ReactNode
  dot?: boolean
}) {
  return (
    <span className={`badge badge--${tone}`}>
      {dot && <span className="badge__dot" aria-hidden="true" />}
      {children}
    </span>
  )
}

/* ==========================================================================
   Panel
   ========================================================================== */

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = '',
  bleed = false,
}: {
  title?: ReactNode
  eyebrow?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bleed?: boolean
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || eyebrow || action) && (
        <header className="panel__head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h3 className="panel__title">{title}</h3>}
          </div>
          {action && <div className="panel__action">{action}</div>}
        </header>
      )}
      <div className={bleed ? 'panel__body panel__body--bleed' : 'panel__body'}>
        {children}
      </div>
    </section>
  )
}

/* ==========================================================================
   Stat — a number, its unit, and a label. Never a fake percentage.
   ========================================================================== */

export function Stat({
  value,
  label,
  unit,
  tone = 'neutral',
  note,
}: {
  value: ReactNode
  label: string
  unit?: string
  tone?: Tone
  note?: ReactNode
}) {
  return (
    <div className={`stat stat--${tone}`}>
      <p className="stat__value">
        <span className="stat__number">{value}</span>
        {unit && <span className="stat__unit">{unit}</span>}
      </p>
      <p className="stat__label">{label}</p>
      {note && <p className="stat__note">{note}</p>}
    </div>
  )
}

/* ==========================================================================
   Meter — a value against a maximum
   ========================================================================== */

export function Meter({
  value,
  max,
  tone = 'accent',
  label,
}: {
  value: number
  max: number
  tone?: Tone
  label?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div
      className={`meter meter--${tone}`}
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <span className="meter__fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

/* ==========================================================================
   Empty state
   ========================================================================== */

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string
  body?: ReactNode
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon">{icon}</div>}
      <p className="empty__title">{title}</p>
      {body && <p className="empty__body">{body}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  )
}
