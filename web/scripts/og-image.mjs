/**
 * Render the social preview card and the mobile home-screen icon.
 *
 * Both are drawn from the project's own design system — the real typefaces,
 * the real mark, the real palette — rather than a stock image. Re-run after a
 * brand change:
 *
 *     node scripts/og-image.mjs
 *
 * Writes web/public/og.png (1200x630) and web/public/apple-touch-icon.png
 * (180x180). No network access: the woff2 files are inlined as data URIs so
 * Chromium does not need a font server or a CORS-friendly origin.
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(here, '..')
const fonts = path.join(webRoot, 'public', 'fonts')

const MARK = `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <path d="M16 4.6c5.1 5.8 8.7 10.2 8.7 14.7a8.7 8.7 0 1 1-17.4 0c0-4.5 3.6-8.9 8.7-14.7Z"
        stroke="#e0394c" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M9.1 19.3h2.6l1.6-4.1 2.4 7.6 1.9-4.3h3.4"
        stroke="#e0394c" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

async function face(family, style, weight, file) {
  const data = await readFile(path.join(fonts, file))
  return `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};` +
    `src:url(data:font/woff2;base64,${data.toString('base64')}) format('woff2');}`
}

const css = `
${await face('Instrument Serif', 'normal', '400', 'instrument-serif-normal.woff2')}
${await face('Instrument Serif', 'italic', '400', 'instrument-serif-italic.woff2')}
${await face('Inter', 'normal', '300 600', 'inter-normal.woff2')}
${await face('JetBrains Mono', 'normal', '400 500', 'jetbrains-mono-normal.woff2')}

*{box-sizing:border-box;margin:0}
body{
  width:1200px;height:630px;overflow:hidden;
  background:#0a0b0d;color:#f2f4f7;
  font-family:'Inter',sans-serif;
  position:relative;
}
/* A single quiet light source, matching the site's ambient treatment. */
body::before{
  content:'';position:absolute;inset:-40% 40% 40% -20%;
  background:radial-gradient(closest-side,rgba(224,57,76,.14),transparent 70%);
}
.grain{
  position:absolute;inset:0;opacity:.5;
  background-image:radial-gradient(rgba(255,255,255,.055) 1px,transparent 1px);
  background-size:3px 3px;
}
.frame{position:absolute;inset:52px;border:1px solid rgba(255,255,255,.08)}
.card{position:relative;height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:96px 104px}
.eyebrow{
  font-family:'JetBrains Mono',monospace;font-size:15px;letter-spacing:.16em;
  text-transform:uppercase;color:#9aa2ad;display:flex;align-items:center;gap:14px;
}
.eyebrow svg{width:34px;height:34px}
h1{
  font-family:'Instrument Serif',serif;font-weight:400;font-size:82px;line-height:1.02;
  letter-spacing:-.018em;max-width:900px;
}
h1 em{font-style:italic;color:#f0566a}
.foot{
  display:flex;align-items:baseline;justify-content:space-between;
  border-top:1px solid rgba(255,255,255,.1);padding-top:26px;
  font-family:'JetBrains Mono',monospace;font-size:15px;color:#7d8590;
}
.foot strong{color:#d6dae0;font-weight:400}
`

const iconCss = `
${await face('Inter', 'normal', '300 600', 'inter-normal.woff2')}
*{box-sizing:border-box;margin:0}
body{width:180px;height:180px;background:#0a0b0d;display:grid;place-items:center}
svg{width:112px;height:112px}
`

const browser = await chromium.launch()

// --- open graph card -------------------------------------------------------
const og = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await og.setContent(`<!doctype html><meta charset="utf-8">
<style>${css}</style>
<div class="grain"></div><div class="frame"></div>
<div class="card">
  <div class="eyebrow">${MARK}<span>Blood Donation Network</span></div>
  <h1>A directory answers a request.<br><em>This escalates it.</em></h1>
  <div class="foot">
    <span><strong>Donor matching</strong> · SLA escalation · shortage forecasting</span>
    <span>open source</span>
  </div>
</div>`)
await og.evaluate(() => document.fonts.ready)

// The card is fixed-size, so verify the type actually fits instead of trusting
// a screenshot nobody may look at again. If the headline overlaps the footer or
// runs past the frame, fail the build step.
const fit = await og.evaluate(() => {
  const box = (selector) => document.querySelector(selector).getBoundingClientRect()
  const h1 = box('h1')
  const foot = box('.foot')
  const eyebrow = box('.eyebrow')
  return {
    headlineWidth: Math.round(h1.width),
    headlineLines: Math.round(h1.height / 84),
    gapToFooter: Math.round(foot.top - h1.bottom),
    gapFromEyebrow: Math.round(h1.top - eyebrow.bottom),
    withinCard: h1.left >= 0 && h1.right <= 1200 && h1.top >= 0 && h1.bottom <= 630,
  }
})
if (!fit.withinCard || fit.gapToFooter < 8 || fit.gapFromEyebrow < 8) {
  throw new Error(`social card layout does not fit: ${JSON.stringify(fit)}`)
}
console.log(`og card: ${fit.headlineWidth}px wide, ~${fit.headlineLines} lines, ` +
  `${fit.gapToFooter}px clear of the footer`)

await og.screenshot({ path: path.join(webRoot, 'public', 'og.png') })
await og.close()

// --- apple touch icon ------------------------------------------------------
const icon = await browser.newPage({ viewport: { width: 180, height: 180 } })
await icon.setContent(`<!doctype html><meta charset="utf-8">
<style>${iconCss}</style>${MARK}`)
await icon.evaluate(() => document.fonts.ready)
await icon.screenshot({ path: path.join(webRoot, 'public', 'apple-touch-icon.png') })
await icon.close()

await browser.close()

for (const file of ['og.png', 'apple-touch-icon.png']) {
  const { size } = await stat(path.join(webRoot, 'public', file))
  console.log(`${file.padEnd(22)} ${size.toLocaleString()} bytes`)
}
