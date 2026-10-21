import { useId } from 'react'

import { useMeasure } from '../hooks/useMeasure'

/* ==========================================================================
   Helpers
   ========================================================================== */

function niceMax(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const scaled = value / magnitude
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return step * magnitude
}

/** Catmull-Rom → cubic Bézier, so lines curve without overshooting. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  if (points.length < 3) {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ')
  }

  let d = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}

function fmt(value: number, digits = 0): string {
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/* ==========================================================================
   AreaChart — a projected series with an optional stock reference line
   ========================================================================== */

export interface AreaPoint {
  label: string
  value: number
}

export function AreaChart({
  points,
  height = 220,
  reference,
  unit = '',
  tone = 'var(--series-1)',
  id: suffix,
}: {
  points: AreaPoint[]
  height?: number
  reference?: { value: number; label: string } | null
  unit?: string
  tone?: string
  id?: string
}) {
  const { ref, width } = useMeasure<HTMLDivElement>()
  const gradientId = `grad-${useId().replace(/:/g, '')}${suffix ?? ''}`

  const padL = 46
  const padR = 14
  const padT = 18
  const padB = 28
  const w = Math.max(width, 240)
  const innerW = Math.max(w - padL - padR, 10)
  const innerH = Math.max(height - padT - padB, 10)

  if (points.length === 0) {
    return <div ref={ref} style={{ height }} />
  }

  const values = points.map((p) => p.value)
  const peak = Math.max(...values, reference?.value ?? 0, 1)
  const yMax = niceMax(peak * 1.12)

  const xAt = (index: number) =>
    padL + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW)
  const yAt = (value: number) => padT + innerH - (value / yMax) * innerH

  const coords = points.map((point, index) => ({
    x: xAt(index),
    y: yAt(point.value),
  }))

  const line = smoothPath(coords)
  const area = `${line} L${coords[coords.length - 1].x.toFixed(2)} ${(padT + innerH).toFixed(2)} L${coords[0].x.toFixed(2)} ${(padT + innerH).toFixed(2)} Z`

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax)

  return (
    <div ref={ref} className="chart" style={{ height }}>
      {width > 0 && (
        <svg width={w} height={height} role="img" aria-label="Projection chart">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tone} stopOpacity="0.28" />
              <stop offset="100%" stopColor={tone} stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padL}
                x2={w - padR}
                y1={yAt(tick)}
                y2={yAt(tick)}
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
              <text
                x={padL - 10}
                y={yAt(tick) + 4}
                textAnchor="end"
                className="chart__tick"
              >
                {fmt(tick)}
              </text>
            </g>
          ))}

          {reference && (
            <>
              <line
                x1={padL}
                x2={w - padR}
                y1={yAt(reference.value)}
                y2={yAt(reference.value)}
                stroke="var(--ink-tertiary)"
                strokeWidth={1.2}
                strokeDasharray="4 5"
              />
              <text
                x={w - padR}
                y={yAt(reference.value) - 7}
                textAnchor="end"
                className="chart__reference"
              >
                {reference.label}
              </text>
            </>
          )}

          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke={tone}
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="chart__line"
          />

          {coords.map((c, index) => (
            <circle
              key={index}
              cx={c.x}
              cy={c.y}
              r={2.8}
              fill="var(--surface-raised)"
              stroke={tone}
              strokeWidth={1.6}
            >
              <title>{`${points[index].label}: ${fmt(points[index].value, 1)}${unit}`}</title>
            </circle>
          ))}

          {points.map((point, index) => {
            const showEvery = points.length > 8 ? Math.ceil(points.length / 6) : 1
            if (index % showEvery !== 0 && index !== points.length - 1) return null
            return (
              <text
                key={point.label}
                x={xAt(index)}
                y={height - 9}
                textAnchor="middle"
                className="chart__tick"
              >
                {point.label}
              </text>
            )
          })}
        </svg>
      )}
    </div>
  )
}

/* ==========================================================================
   CompareBars — two models side by side, one row per series key
   ========================================================================== */

export interface CompareRow {
  key: string
  left: number
  right: number
}

export function CompareBars({
  rows,
  leftLabel,
  rightLabel,
  leftTone = 'var(--series-3)',
  rightTone = 'var(--series-4)',
  format = (v: number) => v.toFixed(3),
  lowerIsBetter = true,
}: {
  rows: CompareRow[]
  leftLabel: string
  rightLabel: string
  leftTone?: string
  rightTone?: string
  format?: (value: number) => string
  lowerIsBetter?: boolean
}) {
  const { ref, width } = useMeasure<HTMLDivElement>()
  const w = Math.max(width, 240)
  const labelW = 64
  const valueW = 62
  const trackW = Math.max(w - labelW - valueW - 12, 40)
  const peak = Math.max(...rows.flatMap((r) => [r.left, r.right]), 0.0001)

  return (
    <div ref={ref} className="compare">
      <div className="compare__legend">
        <span className="compare__legend-item">
          <i style={{ background: leftTone }} />
          {leftLabel}
        </span>
        <span className="compare__legend-item">
          <i style={{ background: rightTone }} />
          {rightLabel}
        </span>
      </div>

      {rows.map((row) => {
        const leftW = (row.left / peak) * trackW
        const rightW = (row.right / peak) * trackW
        const leftBetter = lowerIsBetter ? row.left <= row.right : row.left >= row.right
        return (
          <div className="compare__row" key={row.key}>
            <span className="compare__key">{row.key}</span>
            <div className="compare__bars">
              <div className="compare__track">
                <span
                  className="compare__bar"
                  style={{ width: `${Math.max(leftW, 2)}%`, background: leftTone }}
                />
                <span
                  className={`compare__value ${leftBetter ? 'is-best' : ''}`}
                  style={{ width: `${Math.max(leftW, 2)}%` }}
                >
                  {format(row.left)}
                </span>
              </div>
              <div className="compare__track">
                <span
                  className="compare__bar"
                  style={{ width: `${Math.max(rightW, 2)}%`, background: rightTone }}
                />
                <span
                  className={`compare__value ${!leftBetter ? 'is-best' : ''}`}
                  style={{ width: `${Math.max(rightW, 2)}%` }}
                >
                  {format(row.right)}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ==========================================================================
   Funnel — notified → accepted → confirmed → collected
   ========================================================================== */

export function Funnel({
  steps,
}: {
  steps: { label: string; value: number; tone?: string }[]
}) {
  const peak = Math.max(...steps.map((s) => s.value), 1)
  return (
    <div className="funnel">
      {steps.map((step, index) => {
        const pct = (step.value / peak) * 100
        const previous = index > 0 ? steps[index - 1].value : null
        const drop = previous !== null && previous > 0
          ? Math.round(((previous - step.value) / previous) * 100)
          : null
        return (
          <div className="funnel__step" key={step.label}>
            <div className="funnel__meta">
              <span className="funnel__label">{step.label}</span>
              <span className="funnel__value num">{step.value}</span>
            </div>
            <div className="funnel__track">
              <span
                className="funnel__fill"
                style={{
                  width: `${Math.max(pct, 1.5)}%`,
                  background: step.tone ?? 'var(--accent)',
                }}
              />
            </div>
            {drop !== null && drop > 0 && (
              <span className="funnel__drop">{drop}% dropped</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ==========================================================================
   Sparkline — a bare trend line, no axes
   ========================================================================== */

export function Sparkline({
  values,
  width = 96,
  height = 28,
  tone = 'var(--series-1)',
}: {
  values: number[]
  width?: number
  height?: number
  tone?: string
}) {
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const coords = values.map((value, index) => ({
    x: (index / (values.length - 1)) * (width - 2) + 1,
    y: height - 2 - ((value - min) / span) * (height - 4),
  }))
  const d = smoothPath(coords)
  return (
    <svg width={width} height={height} className="sparkline" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke={tone}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ==========================================================================
   Gauge — a single proportion, drawn as an arc
   ========================================================================== */

export function Gauge({
  value,
  max = 1,
  size = 132,
  tone = 'var(--accent)',
  caption,
  label,
}: {
  value: number
  max?: number
  size?: number
  tone?: string
  caption?: string
  label?: string
}) {
  const radius = size / 2 - 12
  const circumference = Math.PI * radius
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const dash = circumference * pct

  return (
    <div className="gauge">
      <svg width={size} height={size * 0.62} role="img" aria-label={label ?? 'Gauge'}>
        <path
          d={`M 12 ${size / 2 - 6} A ${radius} ${radius} 0 0 1 ${size - 12} ${size / 2 - 6}`}
          fill="none"
          stroke="var(--chart-grid)"
          strokeWidth={7}
          strokeLinecap="round"
        />
        <path
          d={`M 12 ${size / 2 - 6} A ${radius} ${radius} 0 0 1 ${size - 12} ${size / 2 - 6}`}
          fill="none"
          stroke={tone}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="gauge__value"
        />
      </svg>
      <div className="gauge__readout">
        <span className="gauge__number num">{caption}</span>
        {label && <span className="gauge__label">{label}</span>}
      </div>
    </div>
  )
}
