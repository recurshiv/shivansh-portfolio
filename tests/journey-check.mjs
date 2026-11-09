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

// 1. Look around: pointer left / right of the hero changes the view of the TV.
await scrollG(0)
// The static animates, so this compares the camera pose rather than pixels.
await p.mouse.move(80, 450, { steps: 4 }); await p.waitForTimeout(2200); const L = await shot('look-left'); const camL = await p.evaluate(() => window.__journey.camera())
await p.mouse.move(1360, 450, { steps: 8 }); await p.waitForTimeout(2200); const R = await shot('look-right'); const camR = await p.evaluate(() => window.__journey.camera())
const dLook = Math.hypot(...camL.position.map((v, i) => v - camR.position[i]))
check('pointer shifts the viewing angle of the TV', dLook > 0.3, `camera moved ${dLook.toFixed(2)} units`)
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

// 2. TV screen: the pointer bends the static, a click degausses, the glint can be peeked through.
const hero = () => p.evaluate(() => window.__journey.hero())
await p.mouse.move(980, 500, { steps: 6 }); await p.waitForTimeout(1500)
const onScreen = await hero()
check('pointer on the TV screen bends the static', onScreen.mag > 0.8, `magnet ${onScreen.mag.toFixed(2)}`)
await p.mouse.click(980, 500)
// Read the state on the first frame after the click; slow software frames can take longer than a fixed wait.
const clicked = await (await p.waitForFunction((prev) => { const h = window.__journey.hero(); return h.channel !== prev ? h : false }, onScreen.channel, { polling: 'raf', timeout: 5000 }).catch(() => null))?.jsonValue() ?? await hero()
check('a click degausses the tube and turns the channel dial', clicked.channel === onScreen.channel + 1 && clicked.degauss > 0.05, `channel ${onScreen.channel}→${clicked.channel}, degauss ${clicked.degauss.toFixed(2)}`)
const [sx, sy] = await p.evaluate(() => window.__journey.state.spot)
await p.mouse.move(sx, sy, { steps: 6 }); await p.waitForTimeout(2200); const G1 = await shot('peek-on')
const peek = await hero()
check('hovering the glint opens a peek through it', peek.hover > 0.8, `hover ${peek.hover.toFixed(2)}`)
await p.mouse.move(700, 820, { steps: 6 }); await p.waitForTimeout(2200); const G0 = await shot('peek-off')
const off = await hero()
check('moving away closes the peek and releases the magnet', off.hover < 0.1 && off.mag < 0.1, `hover ${off.hover.toFixed(2)}, magnet ${off.mag.toFixed(2)}`)
const dLensText = await diff(G1, G0, { left: 60, top: 280, width: 560, height: 380 })
check('the screen effects leave the text crisp', dLensText < 0.5, `mean diff in text ${dLensText.toFixed(2)}`)

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
  const d3 = await diff(f1, f2, { left: 1000, top: 0, width: 440, height: 420 })
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
  // Scenes animate over time (clips fly, the planet spins), so the pose is the real test; the image Δ is informational.
  check(`scrolling back to g=${g} retraces the same pose`, cam.world === cam2.world && dist < 1e-3, `world ${cam.world}/${cam2.world}, pose Δ ${dist.toExponential(1)}, image Δ ${d.toFixed(2)}`)
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

// ---------- Cards fit on common laptop screens without scrolling ----------
for (const [w, h] of [[1440, 900], [1366, 768], [1280, 720]]) {
  const c = await b.newContext({ viewport: { width: w, height: h } })
  const q = await c.newPage()
  await q.goto(URL, { waitUntil: 'networkidle' })
  await q.waitForFunction(() => window.__journey)
  const fits = await q.$$eval('.project .card', (cards) =>
    cards.map((c) => ({ overflow: c.scrollHeight > c.clientHeight + 1, tall: c.getBoundingClientRect().height > innerHeight - 90 })),
  )
  check(`${w}×${h}: every project card fits without scrolling`, fits.every((f) => !f.overflow && !f.tall), JSON.stringify(fits))
  await c.close()
}

// ---------- Phone: desktop required ----------
{
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const q = await c.newPage()
  const e2 = []
  q.on('pageerror', (e) => e2.push(String(e)))
  await q.goto(URL, { waitUntil: 'networkidle' })
  await q.waitForTimeout(800)
  const mode = await q.evaluate(() => document.documentElement.className)
  const three = await q.evaluate(() => performance.getEntriesByType('resource').some((r) => r.name.includes('journey')))
  check('phone: "desktop required" page, Three.js not loaded', mode.includes('phone') && !three, `class=${mode}`)
  const desk = await q.evaluate(() => {
    const visible = (el) => !!el && el.getClientRects().length > 0
    return {
      title: document.querySelector('.desk h1')?.textContent.replace(/\s+/g, ' ').trim(),
      says: /desktop required/i.test(document.querySelector('.desk').innerText),
      links: [...document.querySelectorAll('.desk a')].filter(visible).map((a) => a.href),
      main: visible(document.querySelector('main')),
      share: visible(document.querySelector('.desk__share')),
    }
  })
  check('phone: says desktop required, with name, share button and project links', desk.says && desk.title === 'Shivansh Pratap Singh' && desk.share && desk.links.length === 5 && !desk.main, JSON.stringify(desk))
  check('phone: no horizontal scroll', !(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth)))
  const small = await q.$$eval('p, li, a, button', (els) => els.filter((e) => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 11).length)
  check('phone: no text under 11px', small === 0, `${small} elements`)
  await q.screenshot({ path: `${OUT}/phone.png` })
  check('phone: no errors', e2.length === 0, e2.join(' | '))
  await c.close()
}

// ---------- Reduced motion still gets the journey by default ----------
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const q = await c.newPage()
  await q.goto(URL, { waitUntil: 'networkidle' })
  await q.waitForFunction(() => window.__journey, null, { timeout: 15000 }).catch(() => {})
  check('reduced motion: 3D journey is the default', (await q.evaluate(() => document.documentElement.className)).includes('journey'))
  await c.close()
}

// ---------- Software renderer: hardware acceleration notice ----------
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const q = await c.newPage()
  await q.goto(URL, { waitUntil: 'networkidle' })
  await q.waitForTimeout(800)
  const gpu = await q.evaluate(() => ({ gpu: document.documentElement.dataset.gpu, shown: !document.querySelector('.gpu-note').hidden }))
  check('software renderer (SwiftShader here): hardware acceleration notice shows', gpu.gpu === 'software' && gpu.shown, JSON.stringify(gpu))
  await q.click('.gpu-note__more')
  const steps = await q.evaluate(() => !document.querySelector('.gpu-note__steps').hidden && document.querySelector('.gpu-note__addr').textContent)
  check('notice: "How to fix" opens the steps with the settings address', steps === 'chrome://settings/system', String(steps))
  await q.screenshot({ path: `${OUT}/gpu-note.png` })
  await q.click('.gpu-note__close')
  await q.reload({ waitUntil: 'networkidle' }); await q.waitForTimeout(500)
  check('notice: dismissing it keeps it closed for the session', await q.evaluate(() => document.querySelector('.gpu-note').hidden))
  await c.close()
}

// ---------- Linear fallback (?mode=linear) ----------
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const q = await c.newPage()
  const e2 = []
  q.on('pageerror', (e) => e2.push(String(e)))
  await q.goto(URL + '?mode=linear', { waitUntil: 'networkidle' })
  await q.waitForTimeout(800)
  const mode = await q.evaluate(() => document.documentElement.className)
  const three = await q.evaluate(() => performance.getEntriesByType('resource').some((r) => r.name.includes('journey')))
  check('linear: readable layout, Three.js not loaded', mode.includes('linear') && !three, `class=${mode}`)
  const headings = await q.$$eval('main h1, main h2', (hs) => hs.map((h) => h.textContent.trim().replace(/\s+/g, ' ')))
  check('linear: all sections readable in order', headings.join(' | ') === 'Shivansh Pratap Singh | SyncDocs | Universal Clipboard Sync | Final Transmission | Still Pavilion | A bit about me.', headings.join(' | '))
  check('linear: no horizontal scroll', !(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth)))
  check('linear: no errors', e2.length === 0, e2.join(' | '))
  await c.close()
}

// No WebGL.
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } })
  await c.addInitScript(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a) } })
  const q = await c.newPage()
  await q.goto(URL, { waitUntil: 'networkidle' })
  const r = await q.evaluate(() => ({ cls: document.documentElement.className, note: !document.querySelector('.gpu-note').hidden }))
  check('no WebGL: linear layout with the hardware acceleration notice', r.cls.includes('linear') && r.note, JSON.stringify(r))
  await q.screenshot({ path: `${OUT}/nowebgl.png` })
  await c.close()
}
await b.close()
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
