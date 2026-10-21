export function Logo({
  size = 30,
  withWordmark = true,
  tone = 'accent',
}: {
  size?: number
  withWordmark?: boolean
  tone?: 'accent' | 'plain'
}) {
  const stroke = tone === 'accent' ? 'var(--accent)' : 'currentColor'
  return (
    <span className="logo">
      <svg
        className="logo__mark"
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M16 3.4c5.4 6.1 9.2 10.8 9.2 15.6a9.2 9.2 0 1 1-18.4 0c0-4.8 3.8-9.5 9.2-15.6Z"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M8.6 19.1h2.8l1.7-4.4 2.6 8.1 2-4.6h3.7"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.92"
        />
      </svg>
      {withWordmark && (
        <span className="logo__word">
          <span className="logo__word-main">Blood Donation</span>
          <span className="logo__word-sub">Network</span>
        </span>
      )}
    </span>
  )
}
