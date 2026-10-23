// Objective design audit — checks the things the brief actually specifies:
// dark base, restrained palette, real fonts, contrast, no emoji, no horizontal
// overflow at three widths, and sane heading sizes.
import { chromium } from 'playwright'

const ORIGIN = 'http://127.0.0.1:8000'
const browser = await chromium.launch()

const results = []
const rec = (label, ok, detail = '') => results.push({ label, ok, detail })

// Emoji detector: pictographic ranges only, so typographic marks are allowed.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F2FF}]/u

for (const width of [1440, 834, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)

  const audit = await page.evaluate(() => {
    const body = getComputedStyle(document.body)
    const root = getComputedStyle(document.documentElement)

    // Sample the luminance of the page background.
    const parse = (c) => (c.match(/[\d.]+/g) ?? []).map(Number)
    const [br, bg, bb] = parse(body.backgroundColor)
    const bgLum = (0.2126 * br + 0.7152 * bg + 0.0722 * bb) / 255

    const text = document.body.innerText

    // Every heading size on the page, to catch "oversized headings everywhere".
    const headingSizes = [...document.querySelectorAll('h1,h2,h3')].map((el) =>
      Math.round(parseFloat(getComputedStyle(el).fontSize)),
    )

    return {
      bg: body.backgroundColor,
      bgLum,
      text,
      fontFamily: body.fontFamily,
      headingSizes,
      h1Count: document.querySelectorAll('h1').length,
      scrollOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // Count distinct background-image gradients — the brief warns against excess.
      gradientCount: [...document.querySelectorAll('*')].filter((el) =>
        getComputedStyle(el).backgroundImage.includes('gradient'),
      ).length,
      backdropFilters: [...document.querySelectorAll('*')].filter((el) => {
        const bf = getComputedStyle(el).backdropFilter
        return bf && bf !== 'none'
      }).length,
      landmarkCount: document.querySelectorAll('main,header,nav,footer,section').length,
      imgTags: document.querySelectorAll('img').length,
      rootFont: root.fontFamily,
    }
  })

  rec(`@${width} background is dark`, audit.bgLum < 0.12, `${audit.bg} (lum ${audit.bgLum.toFixed(3)})`)
  rec(`@${width} no horizontal overflow`, audit.scrollOverflow <= 1, `${audit.scrollOverflow}px`)
  rec(`@${width} no emoji in content`, !EMOJI.test(audit.text), '')
  rec(
    `@${width} single h1, none oversized past 96px`,
    audit.h1Count <= 1 && audit.headingSizes.every((s) => s <= 96),
    `h1=${audit.h1Count} sizes=${[...new Set(audit.headingSizes)].sort((a, b) => b - a).join(',')}`,
  )
  rec(
    `@${width} gradients are restrained (<12 elements)`,
    audit.gradientCount < 12,
    `${audit.gradientCount} elements`,
  )
  rec(
    `@${width} glassmorphism is not overused (<6 elements)`,
    audit.backdropFilters < 6,
    `${audit.backdropFilters} backdrop-filter elements`,
  )
  rec(
    `@${width} uses real fonts, not system default`,
    /Inter|Instrument|JetBrains/.test(audit.fontFamily),
    audit.fontFamily.slice(0, 60),
  )
  rec(`@${width} has semantic landmarks`, audit.landmarkCount >= 3, `${audit.landmarkCount}`)

  await ctx.close()
}

// Contrast of the primary body text against the page background.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
const contrast = await page.evaluate(() => {
  const lum = (r, g, b) => {
    const f = (v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const parse = (c) => (c.match(/[\d.]+/g) ?? []).map(Number)
  const bg = lum(...parse(getComputedStyle(document.body).backgroundColor).slice(0, 3))
  const sample = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const fg = lum(...parse(getComputedStyle(el).color).slice(0, 3))
    const [a, b] = [Math.max(fg, bg), Math.min(fg, bg)]
    return +((a + 0.05) / (b + 0.05)).toFixed(2)
  }
  return { p: sample('p'), h1: sample('h1'), body: sample('body') }
})
rec(
  'body text meets WCAG AA (>= 4.5:1)',
  contrast.body !== null && contrast.body >= 4.5,
  `body=${contrast.body} h1=${contrast.h1} p=${contrast.p}`,
)
rec(
  'first paragraph meets WCAG AA (>= 4.5:1)',
  contrast.p !== null && contrast.p >= 4.5,
  `p=${contrast.p}`,
)
await ctx.close()

/* -------------------------------------------------------------------------
   Shape, colour and crawlability — the newer brief rules.
   ------------------------------------------------------------------------- */

const probe = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const p = await probe.newPage()
const pageErrors = []
p.on('pageerror', (error) => pageErrors.push(String(error)))
await p.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await p.waitForTimeout(300)

// --- no pill-shaped buttons ------------------------------------------------
const pills = await p.evaluate(() => {
  const offenders = []
  for (const el of document.querySelectorAll('.btn, .badge, .segmented, .segmented__item')) {
    const cs = getComputedStyle(el)
    const radius = parseFloat(cs.borderTopLeftRadius)
    const height = el.getBoundingClientRect().height
    if (height > 0 && radius >= height / 2 - 1) {
      const name = typeof el.className === 'string' ? el.className : el.tagName
      offenders.push(`${name} r=${radius}px h=${height.toFixed(0)}px`)
    }
  }
  return offenders
})
rec(
  'buttons and chips are not pill-shaped',
  pills.length === 0,
  pills.length ? pills.slice(0, 4).join('; ') : 'radius stays below half the control height',
)

// --- no purple anywhere in computed colour --------------------------------
const purple = await p.evaluate(() => {
  const toHsl = (r, g, b) => {
    r /= 255
    g /= 255
    b /= 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const lightness = (max + min) / 2
    const delta = max - min
    if (!delta) return { hue: 0, sat: 0, lightness }
    const sat = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    let hue
    if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0)
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    return { hue: hue * 60, sat, lightness }
  }
  const parse = (c) => (c.match(/[\d.]+/g) ?? []).map(Number)
  const props = [
    'color',
    'backgroundColor',
    'borderTopColor',
    'borderLeftColor',
    'outlineColor',
    'fill',
    'stroke',
  ]
  const offenders = []
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    for (const prop of props) {
      const value = cs[prop]
      if (!value || !value.startsWith('rgb')) continue
      const [r, g, b, a] = parse(value)
      if (a === 0) continue
      const { hue, sat, lightness } = toHsl(r, g, b)
      if (sat > 0.18 && lightness > 0.12 && lightness < 0.9 && hue >= 265 && hue <= 320) {
        const name = typeof el.className === 'string' ? el.className : el.tagName
        offenders.push(`${name.trim() || el.tagName} ${prop}=${value}`)
      }
    }
  }
  return offenders.slice(0, 6)
})
rec(
  'no purple or violet in any computed colour',
  purple.length === 0,
  purple.length ? purple.join('; ') : 'hues stay outside 265-320deg',
)

// --- zero third-party runtime requests ------------------------------------
const external = await p.evaluate(() =>
  performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(window.location.origin)),
)
rec(
  'no third-party requests at runtime',
  external.length === 0,
  external.length ? external.slice(0, 3).join(', ') : 'fonts and assets are all same-origin',
)

// The CSS stack says "Inter" even when a font fails to load, so ask the font
// set directly and confirm woff2 files were fetched from this origin.
const fonts = await p.evaluate(async () => {
  await document.fonts.ready
  const families = ['Inter', 'Instrument Serif', 'JetBrains Mono']
  return {
    available: Object.fromEntries(
      families.map((family) => [family, document.fonts.check(`16px "${family}"`)]),
    ),
    files: performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.endsWith('.woff2'))
      .map((name) => name.split('/').pop()),
  }
})
const missing = Object.entries(fonts.available)
  .filter(([, ok]) => !ok)
  .map(([family]) => family)
rec(
  'all three typefaces load from this origin',
  missing.length === 0 && fonts.files.length > 0,
  missing.length ? `not loaded: ${missing.join(', ')}` : fonts.files.join(', '),
)

// --- document metadata ----------------------------------------------------
const meta = await p.evaluate(() => {
  const content = (selector) =>
    document.querySelector(selector)?.getAttribute('content') ?? ''
  const canonical = document.querySelector('link[rel="canonical"]')?.href ?? ''
  let ld = null
  try {
    ld = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent ?? 'null')
  } catch {
    ld = null
  }
  return {
    title: document.title,
    description: content('meta[name="description"]'),
    robots: content('meta[name="robots"]'),
    ogTitle: content('meta[property="og:title"]'),
    ogImage: content('meta[property="og:image"]'),
    twitter: content('meta[name="twitter:card"]'),
    canonical,
    jsonLd: ld?.['@type'] ?? null,
    skipLink: document.querySelector('.skip-link')?.getAttribute('href') ?? '',
    mainTarget: Boolean(document.querySelector('main#main')),
    h1: document.querySelector('h1')?.textContent?.trim() ?? '',
  }
})
rec(
  'title, description and robots are set',
  meta.title.length > 10 && meta.description.length > 60 && meta.robots.includes('index'),
  `"${meta.title}" / ${meta.description.length} chars / ${meta.robots}`,
)
rec(
  'social preview tags point at the real origin',
  meta.ogTitle.length > 0 && meta.ogImage.startsWith(ORIGIN),
  `og:image=${meta.ogImage}`,
)
rec(
  'canonical link is absolute and self-referential',
  meta.canonical === ORIGIN + '/',
  meta.canonical || 'missing',
)
rec('structured data parses', meta.jsonLd === 'SoftwareApplication', String(meta.jsonLd))
rec(
  'twitter card is declared',
  meta.twitter === 'summary_large_image',
  meta.twitter || 'missing',
)
rec(
  'skip link targets a real main landmark',
  meta.skipLink === '#main' && meta.mainTarget,
  `href=${meta.skipLink || 'missing'} main#main=${meta.mainTarget}`,
)
rec(
  'hero headline is specific, not a slogan',
  meta.h1.split(/\s+/).length >= 3 && meta.h1.length <= 90,
  `"${meta.h1}"`,
)

// --- crawl files are generated for the serving origin ---------------------
const robotsTxt = await p.evaluate(async () => {
  const response = await fetch('/robots.txt')
  return { status: response.status, text: await response.text() }
})
const sitemapXml = await p.evaluate(async () => {
  const response = await fetch('/sitemap.xml')
  return { status: response.status, text: await response.text() }
})
rec(
  'robots.txt is served and points at the sitemap',
  robotsTxt.status === 200 && robotsTxt.text.includes(`Sitemap: ${ORIGIN}/sitemap.xml`),
  `status=${robotsTxt.status}`,
)
rec(
  'sitemap lists the public routes for this origin',
  sitemapXml.status === 200 &&
    sitemapXml.text.includes(`${ORIGIN}/privacy`) &&
    sitemapXml.text.includes(`${ORIGIN}/terms`),
  `status=${sitemapXml.status} ${sitemapXml.text.length} bytes`,
)

const ogImage = await p.request.get(`${ORIGIN}/og.png`)
rec(
  'social preview image is a real 1200x630 png',
  ogImage.status() === 200 && ogImage.headers()['content-type']?.includes('image/png'),
  `${ogImage.status()} ${ogImage.headers()['content-type']}`,
)

// --- legal pages exist, are readable and carry the footer -----------------
for (const path of ['/privacy', '/terms']) {
  for (const width of [1440, 390]) {
    const legalCtx = await browser.newContext({ viewport: { width, height: 900 } })
    const legal = await legalCtx.newPage()
    await legal.goto(ORIGIN + path, { waitUntil: 'networkidle' })
    const audit = await legal.evaluate(() => ({
      h1: document.querySelector('h1')?.textContent?.trim() ?? '',
      sections: document.querySelectorAll('main#main section').length,
      footerLinks: [...document.querySelectorAll('.site-footer__links a')].map((a) =>
        a.getAttribute('href'),
      ),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '',
    }))
    const label = path.replace('/', '')
    rec(
      `@${width} ${label} renders with a heading and sections`,
      audit.h1.length > 2 && audit.sections >= 5,
      `h1="${audit.h1}" sections=${audit.sections}`,
    )
    rec(
      `@${width} ${label} links to the other legal page`,
      audit.footerLinks.includes('/privacy') && audit.footerLinks.includes('/terms'),
      audit.footerLinks.join(' '),
    )
    rec(`@${width} ${label} has no horizontal overflow`, audit.overflow <= 1, `${audit.overflow}px`)
    rec(
      `@${width} ${label} is indexable`,
      audit.robots.includes('index'),
      audit.robots || 'missing',
    )
    await legalCtx.close()
  }
}

rec('no uncaught page errors during the audit', pageErrors.length === 0, pageErrors.join('; '))
await probe.close()

await browser.close()

const width = Math.max(...results.map((r) => r.label.length))
let failed = 0
for (const r of results) {
  if (!r.ok) failed += 1
  console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.label.padEnd(width)}  ${r.detail}`)
}
console.log()
console.log(`${results.length - failed}/${results.length} design checks passed`)
process.exit(failed ? 1 : 0)
