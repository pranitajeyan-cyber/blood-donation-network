import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 18, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  }
}

export const ArrowRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12h15" />
    <path d="m13 6 6 6-6 6" />
  </svg>
)

export const ArrowUpRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  </svg>
)

export const Check = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
)

export const X = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
)

export const ChevronDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)

export const ChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export const Alert = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.6 2.8 19.4a1 1 0 0 0 .87 1.5h16.66a1 1 0 0 0 .87-1.5Z" />
    <path d="M12 9.5v4.2" />
    <path d="M12 17.2h.01" />
  </svg>
)

export const Info = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </svg>
)

export const Pulse = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 12h3.6l2.2-6.4 3.6 12.8 2.6-8.2 1.6 1.8H21" />
  </svg>
)

export const Drop = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.2c3.2 3.5 5.4 6.3 5.4 9A5.4 5.4 0 0 1 12 17.6a5.4 5.4 0 0 1-5.4-5.4c0-2.7 2.2-5.5 5.4-9Z" />
  </svg>
)

export const Users = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0" />
    <path d="M16.2 5.1a3.4 3.4 0 0 1 0 6.3" />
    <path d="M17.6 13.6a6.2 6.2 0 0 1 3.6 5.9" />
  </svg>
)

export const Building = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 20.5V5.2a.7.7 0 0 1 .7-.7h8.6a.7.7 0 0 1 .7.7v15.3" />
    <path d="M14 10.2h5.3a.7.7 0 0 1 .7.7v9.6" />
    <path d="M2.6 20.5h18.8" />
    <path d="M7 8h3M7 11.5h3M7 15h3" />
  </svg>
)

export const LogOut = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14.5 7.5V5.4a1.4 1.4 0 0 0-1.4-1.4H5.4A1.4 1.4 0 0 0 4 5.4v13.2a1.4 1.4 0 0 0 1.4 1.4h7.7a1.4 1.4 0 0 0 1.4-1.4v-2.1" />
    <path d="M9.6 12H21" />
    <path d="m17.6 8.4 3.4 3.6-3.4 3.6" />
  </svg>
)

export const Refresh = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5" />
    <path d="M4 4v4.5h4.5" />
    <path d="M4 12.5A8 8 0 0 0 17.7 17.7L20 15.5" />
    <path d="M20 20v-4.5h-4.5" />
  </svg>
)

export const Lock = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4.6" y="10.2" width="14.8" height="10" rx="2" />
    <path d="M8.2 10.2V7.8a3.8 3.8 0 0 1 7.6 0v2.4" />
  </svg>
)

export const Shield = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3 4.8 5.8v5.5c0 4.2 2.9 8.1 7.2 9.7 4.3-1.6 7.2-5.5 7.2-9.7V5.8Z" />
    <path d="m9 12 2.2 2.2L15.4 10" />
  </svg>
)

export const Clock = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 7.4V12l3 1.8" />
  </svg>
)

export const Pin = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 21s6.4-5.6 6.4-10.4a6.4 6.4 0 1 0-12.8 0C5.6 15.4 12 21 12 21Z" />
    <circle cx="12" cy="10.4" r="2.4" />
  </svg>
)

export const Layers = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m12 3.4 8.4 4.3L12 12 3.6 7.7Z" />
    <path d="m3.6 12 8.4 4.3 8.4-4.3" />
    <path d="m3.6 16.3 8.4 4.3 8.4-4.3" />
  </svg>
)

export const Chart = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 19.5h16" />
    <path d="M6.5 19.5v-6" />
    <path d="M11 19.5V6.5" />
    <path d="M15.5 19.5v-9" />
    <path d="M20 19.5V9.5" />
  </svg>
)

export const Menu = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)

export const Search = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="m15.5 15.5 4 4" />
  </svg>
)

export const Trash = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.6 7h14.8" />
    <path d="M9.4 7V5.4a1 1 0 0 1 1-1h3.2a1 1 0 0 1 1 1V7" />
    <path d="M6.6 7l.8 11.6a1.4 1.4 0 0 0 1.4 1.3h6.4a1.4 1.4 0 0 0 1.4-1.3L17.4 7" />
    <path d="M10.4 11v5.4M13.6 11v5.4" />
  </svg>
)

export const Spark = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.2 13.6 9l5.8 1.6-5.8 1.6L12 18l-1.6-5.8L4.6 10.6 10.4 9Z" />
    <path d="M18.6 3.6v2.8M20 5h-2.8" />
  </svg>
)
