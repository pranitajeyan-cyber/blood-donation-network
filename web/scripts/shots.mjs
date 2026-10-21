// Capture screenshots of the key pages for visual review.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const ORIGIN = 'http://127.0.0.1:8000'
const OUT = 'shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const shots = [
  ['landing', '/', null],
  ['login', '/login', null],
  ['register', '/register', null],
  ['donor', '/donor', { email: 'arun.kumar0@example.com', password: 'donor12345' }],
  ['hospital', '/hospital', { email: 'hospital1@bdn.dev', password: 'hospital12345' }],
  ['hospital-requests', '/hospital/requests', { email: 'hospital1@bdn.dev', password: 'hospital12345' }],
  ['admin', '/admin', { email: 'admin@bdn.dev', password: 'admin12345' }],
]

for (const [name, path, acct] of shots) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  if (acct) {
    await page.goto(`${ORIGIN}/login`, { waitUntil: 'networkidle' })
    await page.fill('input[type="email"]', acct.email)
    await page.fill('input[type="password"]', acct.password)
    await page.click('button[type="submit"]')
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })
  }
  await page.goto(ORIGIN + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`captured ${name}`)
  await ctx.close()
}

// One mobile shot of the landing page.
const m = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mp = await m.newPage()
await mp.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
await mp.waitForTimeout(600)
await mp.screenshot({ path: `${OUT}/landing-mobile.png`, fullPage: true })
console.log('captured landing-mobile')
await m.close()

await browser.close()
