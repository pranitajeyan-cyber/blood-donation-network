// Browser smoke test: loads the real built SPA from the running FastAPI server,
// signs in as each role, walks every route, and fails on any console error,
// page error, or failed network request. Run with:
//
//   npm run build && node scripts/browser-check.mjs
//
// The server must be listening on http://127.0.0.1:8000 with web/dist present.

import { chromium } from 'playwright'

const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:8000'

const ACCOUNTS = {
  admin: { email: 'admin@bdn.dev', password: 'admin12345' },
  hospital: { email: 'hospital1@bdn.dev', password: 'hospital12345' },
  donor: { email: 'arun.kumar0@example.com', password: 'donor12345' },
}

// Routes each role is allowed to see, and a selector that proves it rendered.
const ROUTES = {
  donor: [
    ['/donor', '.kpi-card, .panel'],
    ['/donor/alerts', '.panel, .empty-state'],
    ['/donor/history', '.panel, .empty-state'],
    ['/donor/profile', 'form, .panel'],
  ],
  hospital: [
    ['/hospital', '.kpi-card, .panel'],
    ['/hospital/requests', '.panel, .empty-state'],
    ['/hospital/inventory', '.data-table, .panel'],
    ['/hospital/actions', 'form, .panel'],
  ],
  admin: [['/admin', '.kpi-card, .panel']],
}

// Public routes, checked with no session at all.
const PUBLIC = [
  ['/', 'Blood Donation Network'],
  ['/login', 'form'],
  ['/register', 'form'],
  ['/privacy', 'What this service is'],
  ['/terms', 'It is not a medical service'],
  ['/does-not-exist', '404'],
]

const results = []
const record = (label, ok, detail = '') => results.push({ label, ok, detail })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } })
const page = await context.newPage()

let problems = []
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console: ${msg.text()}`)
})
page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))
page.on('requestfailed', (req) => {
  problems.push(`requestfailed: ${req.url()} — ${req.failure()?.errorText}`)
})
page.on('response', (res) => {
  if (res.status() >= 500) problems.push(`http ${res.status()}: ${res.url()}`)
})

// --- public routes ---------------------------------------------------------
for (const [path, needle] of PUBLIC) {
  problems = []
  await page.goto(ORIGIN + path, { waitUntil: 'networkidle' })
  const html = await page.content()
  const visible = await page.locator('body').innerText()
  record(
    `GET ${path} renders`,
    html.includes(needle) || visible.includes(needle),
    problems.length ? problems.join(' | ') : '',
  )
  record(`GET ${path} has no console errors`, problems.length === 0, problems.join(' | '))
}

// --- the footer and skip link are real navigation --------------------------
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await page.keyboard.press('Tab')
const firstFocus = await page.evaluate(() => ({
  tag: document.activeElement?.tagName?.toLowerCase() ?? '',
  className: document.activeElement?.className?.toString() ?? '',
  href: document.activeElement?.getAttribute('href') ?? '',
}))
record(
  'first Tab lands on the skip link',
  firstFocus.className === 'skip-link' && firstFocus.href === '#main',
  `${firstFocus.tag}.${firstFocus.className} -> ${firstFocus.href}`,
)

await page.click('.site-footer__links a[href="/privacy"]')
await page.waitForURL('**/privacy', { timeout: 10000 })
record('footer Privacy link navigates client-side', page.url().endsWith('/privacy'), page.url())

await page.click('.site-footer__links a[href="/terms"]')
await page.waitForURL('**/terms', { timeout: 10000 })
record('footer Terms link navigates client-side', page.url().endsWith('/terms'), page.url())

// The title is written by an effect after the route commits, so wait for it
// rather than sampling in the same tick as the URL change.
const legalTitle = await page
  .waitForFunction(() => document.title.startsWith('Terms of use'), { timeout: 5000 })
  .then(() => page.title())
  .catch(() => page.title())
record(
  'legal page sets its own document title',
  legalTitle.startsWith('Terms of use'),
  legalTitle,
)
const legalBody = await page.locator('body').innerText()
record(
  'legal page renders its own content',
  legalBody.includes('It is not a medical service'),
  `${legalBody.length} chars`,
)

// --- the sign-in form actually works ---------------------------------------
problems = []
await page.goto(ORIGIN + '/login', { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', ACCOUNTS.donor.email)
await page.fill('input[type="password"]', ACCOUNTS.donor.password)
await page.click('button[type="submit"]')
await page.waitForURL('**/donor', { timeout: 15000 })
record('sign-in form authenticates and redirects', page.url().endsWith('/donor'), page.url())
record('sign-in produces no console errors', problems.length === 0, problems.join(' | '))

// unauthenticated access to a protected route must bounce to /login
const anon = await browser.newContext()
const anonPage = await anon.newPage()
await anonPage.goto(ORIGIN + '/admin', { waitUntil: 'networkidle' })
record(
  'anonymous /admin is redirected to sign-in',
  anonPage.url().includes('/login'),
  anonPage.url(),
)
await anon.close()

// --- each role walks its own routes ----------------------------------------
for (const [role, routes] of Object.entries(ROUTES)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  const p = await ctx.newPage()
  problems = []
  p.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`)
  })
  p.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))
  p.on('response', (res) => {
    if (res.status() >= 500) problems.push(`http ${res.status()}: ${res.url()}`)
  })

  await p.goto(ORIGIN + '/login', { waitUntil: 'networkidle' })
  await p.fill('input[type="email"]', ACCOUNTS[role].email)
  await p.fill('input[type="password"]', ACCOUNTS[role].password)
  await p.click('button[type="submit"]')
  // Wait for the actual navigation — waitForLoadState resolves against the
  // current document and would race the client-side redirect.
  const landed = await p
    .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
  await p.waitForLoadState('networkidle')
  record(`${role} signs in`, landed, p.url())

  for (const [path, selector] of routes) {
    await p.goto(ORIGIN + path, { waitUntil: 'networkidle' })
    const found = (await p.locator(selector).count()) > 0
    // Give async data a moment to land before judging the page empty.
    await p.waitForTimeout(400)
    const text = await p.locator('body').innerText()
    record(
      `${role} ${path} renders content`,
      found && text.length > 40,
      `${text.length} chars of visible text`,
    )
  }

  record(`${role} session has no console errors`, problems.length === 0, problems.join(' | '))
  await ctx.close()
}

// --- responsive: the same routes at phone width ----------------------------
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mp = await mobile.newPage()
problems = []
mp.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))
mp.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console: ${msg.text()}`)
})
await mp.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
// No horizontal overflow is the real test of a responsive layout.
const overflow = await mp.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
)
record('mobile landing has no horizontal overflow', overflow <= 1, `${overflow}px overflow`)
record('mobile landing has no console errors', problems.length === 0, problems.join(' | '))
await mobile.close()

await browser.close()

// --- report ----------------------------------------------------------------
const width = Math.max(...results.map((r) => r.label.length))
let failed = 0
for (const r of results) {
  if (!r.ok) failed += 1
  const mark = r.ok ? 'PASS' : 'FAIL'
  const detail = r.detail ? `  (${r.detail})` : ''
  console.log(`  [${mark}] ${r.label.padEnd(width)}${detail}`)
}
console.log()
console.log(`${results.length - failed}/${results.length} browser checks passed`)
process.exit(failed ? 1 : 0)
