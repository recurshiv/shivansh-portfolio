// Behaviour checks for the portfolio in headless Chromium (software WebGL).
// Usage: npm run build && npx vite preview --port 4173, then in tests/: node journey-check.mjs [screenshot-dir] [url]
import { chromium } from 'playwright'
import sharp from 'sharp'
const OUT = process.argv[2] ?? '.'
const URL = process.argv[3] ?? 'http://localhost:4173/'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`) }

async function diff(a, bb, region) {
  const r = (x) => sharp(x).extract(region).raw().toBuffer()
  const [x, y] = await Promise.all([r(a), r(bb)])
  let s = 0
  for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i])
  return s / x.length
}

// ---------- Desktop journey ----------
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await p.goto(URL, { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__journey)
// The custom cursor follows the mouse; hide it so image comparisons measure the scene.
await p.addStyleTag({ content: '.cursor{display:none!important}' })
await p.waitForTimeout(2500)
check('journey mode on a wide WebGL desktop', await p.evaluate(() => document.documentElement.classList.contains('journey')))

const settle = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).then(() => p.waitForFunction(() => Math.abs(window.__journey.state.g - window.__journey.state.target) < 1e-4, null, { timeout: 15000 })).then(() => p.waitForTimeout(400))
const scrollG = async (g) => {
  await p.evaluate((g) => { const b = window.__journey.bounds(); const i = Math.min(b.length - 2, Math.floor(g)); window.scrollTo(0, b[i] + (b[i + 1] - b[i]) * (g - i)) }, g)
  await settle()
}
const shot = async (name) => { const f = `${OUT}/${name}.png`; await p.screenshot({ path: f }); return f }

// 1. Look around: pointer left / right of the hero changes the view of the instrument.
await scrollG(0)
const inst = { left: 760, top: 60, width: 640, height: 760 }
await p.mouse.move(80, 450, { steps: 4 }); await p.waitForTimeout(2200); const L = await shot('look-left')
await p.mouse.move(1360, 450, { steps: 8 }); await p.waitForTimeout(2200); const R = await shot('look-right')
const dLook = await diff(L, R, inst)
check('pointer shifts the viewing angle of the instrument', dLook > 3, `mean diff ${dLook.toFixed(2)}`)
// Hero text stays put (HTML, not part of the scene).
const dText = await diff(L, R, { left: 60, top: 280, width: 560, height: 380 })
check('hero text is unaffected by the look-around', dText < 0.5, `mean diff ${dText.toFixed(2)}`)
// Ease back to centre when the pointer leaves.
await p.mouse.move(720, 450, { steps: 4 })
await p.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent('mouseleave')))
await p.waitForTimeout(3000)
const released = await p.evaluate(() => window.__journey.camera())
await p.goto(URL + '?fresh', { waitUntil: 'networkidle' }); await p.waitForFunction(() => window.__journey)
await p.addStyleTag({ content: '.cursor{display:none!important}' }); await p.waitForTimeout(3000)
const untouched = await p.evaluate(() => window.__journey.camera())
const dBack = Math.hypot(...released.position.map((v, i) => v - untouched.position[i]), ...released.quaternion.map((v, i) => v - untouched.quaternion[i]))
check('view eases back to centre after the pointer leaves', dBack < 1e-3, `pose Δ vs untouched ${dBack.toExponential(1)}`)

// 2. Refraction lens: pointer on the glass vs beside the instrument.
const glass = { left: 900, top: 230, width: 330, height: 380 }
await p.mouse.move(1060, 420, { steps: 6 }); await p.waitForTimeout(2200); const G1 = await shot('lens-on')
await p.mouse.move(700, 820, { steps: 6 }); await p.waitForTimeout(2200); const G0 = await shot('lens-off')
const dLensGlass = await diff(G1, G0, glass)
check('pointer on the glass refracts the scene behind it', dLensGlass > 2, `mean diff in glass ${dLensGlass.toFixed(2)}`)
const dLensText = await diff(G1, G0, { left: 60, top: 280, width: 560, height: 380 })
check('refraction leaves the text crisp', dLensText < 0.5, `mean diff in text ${dLensText.toFixed(2)}`)

// 2b. Aperture: the iris is closed-ish at rest and opens under the pointer.
check('aperture iris opens under the pointer', dLensGlass > 8, `mean diff ${dLensGlass.toFixed(2)}`)

// 2c. Scene interactions.
{
  await scrollG(2.45); await p.mouse.move(1000, 700); await p.waitForTimeout(2500)
  const a = await shot('sync-before'); await p.mouse.click(1000, 700); await p.waitForTimeout(2500)
  const bb = await shot('sync-after')
  const d = await diff(a, bb, { left: 600, top: 300, width: 760, height: 420 })
  check('SyncDocs: a click writes a new line on the page', d > 0.3, `mean diff ${d.toFixed(2)}`)
  await scrollG(8.45); await p.mouse.move(560, 600, { steps: 3 }); await p.waitForTimeout(3000); const m = await shot('sp-left')
  await p.mouse.move(1420, 600, { steps: 3 }); await p.waitForTimeout(3000); const n = await shot('sp-right')
  const d2 = await diff(m, n, { left: 560, top: 0, width: 880, height: 900 })
  check('Still Pavilion: the pointer changes the light', d2 > 5, `mean diff ${d2.toFixed(2)}`)
  await scrollG(6.45); await p.mouse.move(700, 200, { steps: 3 }); await p.waitForTimeout(2500); const f1 = await shot('ft-a')
  await p.mouse.move(1350, 750, { steps: 3 }); await p.waitForTimeout(2500); const f2 = await shot('ft-b')
  const d3 = await diff(f1, f2, { left: 0, top: 0, width: 560, height: 260 })
  check('Final Transmission: the planet follows the pointer', d3 > 2, `mean diff ${d3.toFixed(2)}`)
}

// 3. Reversibility: reach a pose going forward, scroll far ahead, come back.
await p.mouse.move(720, 450); await p.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent('mouseleave')))
await p.waitForTimeout(2500)
const probes = [1.45, 3.6, 5.5, 7.5]
const forward = []
for (const g of probes) { await scrollG(g); await p.waitForTimeout(600); forward.push({ g, f: await shot(`fwd-${g}`), cam: await p.evaluate(() => window.__journey.camera()) }) }
await scrollG(8.9)
for (const { g, f, cam } of forward.reverse()) {
  // Walk back in small steps, like a reader scrolling up.
  for (let k = 8.9; k > g + 0.25; k -= 0.5) await p.evaluate((k) => { const b = window.__journey.bounds(); const i = Math.floor(k); window.scrollTo(0, b[i] + (b[i + 1] - b[i]) * (k - i)) }, k)
  await scrollG(g); await p.waitForTimeout(600)
  const back = await shot(`back-${g}`)
  const cam2 = await p.evaluate(() => window.__journey.camera())
  const dist = Math.hypot(...cam.position.map((v, i) => v - cam2.position[i]), ...cam.quaternion.map((v, i) => v - cam2.quaternion[i]))
  const d = await diff(f, back, { left: 0, top: 0, width: 1440, height: 900 })
  check(`scrolling back to g=${g} retraces the same pose`, cam.world === cam2.world && dist < 1e-3 && d < 2.5, `world ${cam.world}/${cam2.world}, pose Δ ${dist.toExponential(1)}, image Δ ${d.toFixed(2)}`)
}

// 4. Keyboard: every project link is reachable and visible when focused.
await scrollG(0)
await p.keyboard.press('Tab') // skip link
const wanted = ['Open live app', 'View GitHub fork', 'Visit live site', 'Visit live site', 'github.com/recurshiv']
const seen = []
for (let i = 0; i < 40 && seen.length < 60; i++) {
  await p.keyboard.press('Tab')
  await p.waitForTimeout(250)
  const info = await p.evaluate(() => {
    const el = document.activeElement
    const card = el.closest('.card')
    const r = el.getBoundingClientRect()
    return { text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), href: el.getAttribute('href'), inView: r.top >= 0 && r.bottom <= innerHeight, cardOpacity: card ? getComputedStyle(card).opacity : null }
  })
  seen.push(info)
}
for (const w of ['Open live app', 'View GitHub fork', 'Final Transmission', 'Still Pavilion', 'github.com/recurshiv']) {
  const hit = w.includes('Final') || w.includes('Still')
    ? seen.find((s) => s.text.startsWith('Visit live site') && s.href.includes(w.includes('Final') ? 'final' : 'still'))
    : seen.find((s) => s.text.startsWith(w))
  check(`keyboard reaches “${w}” link, visible on screen`, !!hit && hit.inView && (hit.cardOpacity == null || +hit.cardOpacity === 1), hit ? `opacity ${hit.cardOpacity}` : 'not reached')
}
// View all work panel by keyboard.
await scrollG(0)
await p.focus('.allwork__toggle'); await p.keyboard.press('Enter'); await p.waitForTimeout(300)
const panelLinks = await p.$$eval('#allwork-panel a:not(.allwork__jump)', (as) => as.map((a) => a.href))
check('View all work opens with direct links to the four projects', panelLinks.length === 4, panelLinks.join(' '))
await p.keyboard.press('Escape')
check('Escape closes the panel and returns focus', await p.evaluate(() => document.getElementById('allwork-panel').hidden && document.activeElement.classList.contains('allwork__toggle')))
// Jump link lands on a readable card.
await p.click('.allwork__toggle'); await p.click('a.allwork__jump[href="#clipboard"]'); await settle(); await p.waitForTimeout(500)
const op = await p.$eval('#clipboard .card', (c) => +getComputedStyle(c).opacity)
await shot('jump-clipboard')
check('“Scene 02” shortcut lands on the readable Clipboard scene', op > 0.95, `opacity ${op}`)
// About.
await p.evaluate(() => document.getElementById('about').scrollIntoView())
await p.waitForTimeout(800)
await shot('about')
check('no console errors on desktop', errs.length === 0, errs.join(' | '))
await ctx.close()

// ---------- Linear layouts ----------
for (const [name, opts] of [
  ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['reduced-motion', { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }],
]) {
  const c = await b.newContext(opts)
  const q = await c.newPage()
  const e2 = []
  q.on('pageerror', (e) => e2.push(String(e)))
  await q.goto(URL, { waitUntil: 'networkidle' })
  await q.waitForTimeout(800)
  const mode = await q.evaluate(() => document.documentElement.className)
  const three = await q.evaluate(() => performance.getEntriesByType('resource').some((r) => r.name.includes('journey')))
  check(`${name}: linear layout, Three.js not loaded`, mode.includes('linear') && !three, `class=${mode}`)
  const overflow = await q.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  check(`${name}: no horizontal scroll`, !overflow)
  const headings = await q.$$eval('h1, h2', (hs) => hs.map((h) => h.textContent.trim().replace(/\s+/g, ' ')))
  check(`${name}: all sections readable in order`, headings.join(' | ') === 'Shivansh Pratap Singh | SyncDocs | Universal Clipboard Sync | Final Transmission | Still Pavilion | A bit about me.', headings.join(' | '))
  const small = await q.$$eval('p, li, a', (els) => els.filter((e) => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 11).length)
  check(`${name}: no text under 11px`, small === 0, `${small} elements`)
  await q.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true })
  check(`${name}: no errors`, e2.length === 0, e2.join(' | '))
  await c.close()
}
// No WebGL.
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } })
  await c.addInitScript(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a) } })
  const q = await c.newPage()
  await q.goto(URL, { waitUntil: 'networkidle' })
  check('no WebGL: linear layout', (await q.evaluate(() => document.documentElement.className)).includes('linear'))
  await q.screenshot({ path: `${OUT}/nowebgl.png` })
  await c.close()
}
await b.close()
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
