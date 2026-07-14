#!/usr/bin/env node
/**
 * Capture the den app mockup (docs/mockup.html) driving every flow, to PNG.
 *
 * Produces Full HD (1920×1080) screenshots of the desktop flows plus a
 * responsive pass (tablet + mobile) proving the layout adapts.
 *
 * ── Run on your host (needs network the first time to fetch Chromium) ───────
 *     cd docs
 *     npm init -y            # if there's no package.json here yet
 *     npm i -D playwright
 *     npx playwright install chromium
 *     node capture-mockup.mjs
 *
 * Output → docs/shots/*.png  (numbered in flow order)
 *
 * ── Options (env vars) ──────────────────────────────────────────────────────
 *     SCALE=2            deviceScaleFactor for retina-crisp output (default 1)
 *     OUT=./shots        output directory (default ./shots next to this file)
 *     HTML=./mockup.html path to the mockup (default ./mockup.html next to this)
 *     HEADED=1           run headed (watch it drive) instead of headless
 */

import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCALE = Number(process.env.SCALE || 1)
const OUT = resolve(HERE, process.env.OUT || 'shots')
const HTML = resolve(HERE, process.env.HTML || 'mockup.html')
const HEADED = process.env.HEADED === '1'

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error(`\n✗ Playwright isn't installed here.\n\n  cd ${HERE}\n  npm i -D playwright && npx playwright install chromium\n  node ${fileURLToPath(import.meta.url).split('/').pop()}\n`)
  process.exit(1)
}
if (!existsSync(HTML)) { console.error(`✗ Can't find the mockup at ${HTML}`); process.exit(1) }
mkdirSync(OUT, { recursive: true })

const URL = pathToFileURL(HTML).href
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await chromium.launch({ headless: !HEADED })
  let n = 0
  const shots = []

  // Small wrapper so one flaky step never aborts the whole run.
  const step = async (page, name, fn) => {
    const file = `${String(++n).padStart(2, '0')}-${name}.png`
    try {
      if (fn) await fn()
      await sleep(220) // let fades / transitions settle
      await page.screenshot({ path: join(OUT, file) })
      shots.push(file)
      console.log('  ✓', file)
    } catch (e) {
      console.log('  ✗', file, '—', e.message.split('\n')[0])
    }
  }
  const click = (page, sel) => page.click(sel, { timeout: 4000 })

  // ── Desktop pass · Full HD ────────────────────────────────────────────────
  console.log(`\n▶ Desktop 1920×1080 (scale ${SCALE})`)
  const desk = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: SCALE })
  const page = await desk.newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })
  await sleep(300)

  await step(page, 'sandboxes-home')

  // Open a running sandbox → Agent view
  await step(page, 'detail-agent', () => click(page, '[data-open="claude-den-landing"]'))
  // Shell tab
  await step(page, 'detail-shell', () => click(page, '.term-seg-item[data-tab="shell"]'))
  // Back to agent, open the Files/changes dock (diff)
  await click(page, '.term-seg-item[data-tab="agent"]')
  await step(page, 'files-diff', () => click(page, '#dFiles'))
  // Info dock (toggles Files off, Info on)
  await step(page, 'info-panel', () => click(page, '#dInfo'))
  // close dock
  await click(page, '#dInfo')

  // Create-a-sandbox flow
  await step(page, 'new-sandbox-modal', () => click(page, '#newSbxBtn'))
  const newName = await page.inputValue('#sbxName').catch(() => '')
  await click(page, '#sbxCreate')
  await sleep(1000)
  await step(page, 'sandbox-creating')       // mid creation-log animation
  // wait until the freshly created sandbox opens in the detail view
  await page.waitForFunction(
    (nm) => document.getElementById('view-detail')?.classList.contains('active') &&
            document.getElementById('dName')?.textContent === nm,
    newName, { timeout: 8000 }
  ).catch(() => {})
  await step(page, 'sandbox-created')

  // Kits + create-a-kit flow
  await step(page, 'kits', () => click(page, '.sb-nav-item[data-nav="kits"]'))
  await step(page, 'new-kit-modal', () => click(page, '#newKitBtn'))
  await click(page, '#kitCreate')
  await sleep(400)
  await step(page, 'kit-created')

  // Theming showcase: dark mode + a different palette
  await click(page, '.sb-nav-item[data-nav="home"]')
  await step(page, 'dark-mode', () => click(page, '#modeToggle button[data-mode="dark"]'))
  await click(page, '#themeBtn')
  await step(page, 'theme-tech', () => click(page, '.theme-opt[data-theme="blue"]'))
  await desk.close()

  // ── Responsive pass ───────────────────────────────────────────────────────
  const responsive = [
    { label: 'tablet', w: 1024, h: 1366 },
    { label: 'mobile', w: 390, h: 844 },
  ]
  for (const r of responsive) {
    console.log(`\n▶ ${r.label} ${r.w}×${r.h}`)
    const ctx = await browser.newContext({ viewport: { width: r.w, height: r.h }, deviceScaleFactor: SCALE, isMobile: r.w < 500 })
    const p = await ctx.newPage()
    await p.goto(URL, { waitUntil: 'networkidle' })
    await sleep(300)
    await step(p, `${r.label}-sandboxes`)
    if (r.w < 900) {
      // narrow: sidebar is an off-canvas drawer
      await step(p, `${r.label}-nav-drawer`, () => click(p, '#hambBtn'))
      await click(p, '[data-open="claude-den-landing"]')  // opening also closes the drawer
    } else {
      await click(p, '[data-open="claude-den-landing"]')
    }
    await step(p, `${r.label}-detail`)
    await step(p, `${r.label}-info-overlay`, () => click(p, '#dInfo'))
    await click(p, '#dockClose').catch(() => {})
    await step(p, `${r.label}-new-sandbox`, () => click(p, r.w < 900 ? '#hambBtn' : '#newSbxBtn').then(() => r.w < 900 && click(p, '#sbAdd')))
    await ctx.close()
  }

  await browser.close()
  console.log(`\n✓ ${shots.length} screenshots → ${OUT}\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
