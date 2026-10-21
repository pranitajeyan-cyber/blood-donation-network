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
