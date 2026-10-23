import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './AppShell'
import { ArrowRight } from './Icons'

export type LegalSection = {
  id: string
  heading: string
  body: ReactNode
}

/**
 * Shared frame for the Privacy and Terms pages.
 *
 * Two-column on wide screens (a contents rail beside the prose) and a single
 * column on small ones. The rail is a plain list of anchors, not a card grid —
 * these pages are read, not scanned for features.
 */
export function LegalPage({
  title,
  summary,
  updated,
  notice,
  sections,
}: {
  title: string
  summary: string
  updated: string
  notice?: ReactNode
  sections: LegalSection[]
}) {
  return (
    <div className="legal">
      <SiteHeader />

      <main id="main" tabIndex={-1} className="legal__main">
        <div className="shell">
          <Link to="/" className="legal__back">
            <ArrowRight size={14} style={{ transform: 'rotate(180deg)' }} />
            Back to the home page
          </Link>

          <header className="legal__head">
            <p className="eyebrow">Legal</p>
            <h1 className="legal__title">{title}</h1>
            <p className="legal__summary">{summary}</p>
            <p className="legal__updated">
              Last updated <time dateTime="2026-10-23">{updated}</time>
            </p>
          </header>

          {notice && <div className="legal__notice">{notice}</div>}

          <div className="legal__body">
            <nav className="legal__toc" aria-label="On this page">
              <p className="legal__toc-label">On this page</p>
              <ol>
                {sections.map((section, index) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>
                      <span className="mono" aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="legal__sections">
              {sections.map((section, index) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="legal__section"
                  aria-labelledby={`${section.id}-heading`}
                >
                  <h2 id={`${section.id}-heading`}>
                    <span className="legal__num mono" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {section.heading}
                  </h2>
                  {section.body}
                </section>
              ))}
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
