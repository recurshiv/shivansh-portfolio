import * as THREE from 'three'
import { buildWorlds } from './worlds.js'
import { createTrack, toInner, toOuter } from './track.js'

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export async function start() {
  const canvas = document.querySelector('.stage-canvas')
  const masthead = document.querySelector('.masthead')
  const rail = document.querySelector('.rail')
  const railItems = [...rail.querySelectorAll('li')]
  const hero = document.getElementById('intro')
  const heroCopy = hero.querySelector('.hero__copy')
  const projects = [...document.querySelectorAll('section.project')]
  const cards = projects.map((p) => p.querySelector('.card'))
  const about = document.getElementById('about')
  const hud = document.querySelector('.hud')
  const hudScene = hud.querySelector('.hud__scene')
  const hudMag = hud.querySelector('.hud__mag')
  const hudDepth = hud.querySelector('.hud__depth')
  const hudBar = hud.querySelector('.hud__bar i')
  const cursor = document.querySelector('.cursor')
  const cursorLabel = cursor.querySelector('.cursor__label')
  const finePointer = window.matchMedia('(pointer: fine)').matches
  if (finePointer) document.documentElement.classList.add('has-cursor')

  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))])

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const worlds = await buildWorlds(renderer)
  const track = createTrack(worlds)
  const cams = worlds.map(() => new THREE.PerspectiveCamera(32, 1, 0.1, 100))
  const rtOptions = { samples: 4, type: THREE.HalfFloatType }
  const targets = [null, new THREE.WebGLRenderTarget(1, 1, rtOptions), new THREE.WebGLRenderTarget(1, 1, rtOptions)]

  /* ---------- Sizing ---------- */

  let vw = 0
  let vh = 0
  let dpr = 1
  const bufferSize = new THREE.Vector2()
  let bounds = []

  function measure() {
    vw = window.innerWidth
    vh = window.innerHeight
    dpr = Math.min(window.devicePixelRatio || 1, 1.75)
    renderer.setPixelRatio(dpr)
    renderer.setSize(vw, vh, false)
    renderer.getDrawingBufferSize(bufferSize)
    for (const t of targets) t?.setSize(bufferSize.x, bufferSize.y)
    for (const c of cams) {
      c.aspect = vw / vh
      c.updateProjectionMatrix()
    }
    // Segment boundaries in scroll pixels: hero dwell, then for each project
    // a transit (until the section's top) and a dwell (while its card is pinned).
    const top = (el) => el.getBoundingClientRect().top + window.scrollY
    bounds = [0, hero.offsetHeight - vh]
    for (const p of projects) {
      const t = top(p)
      bounds.push(t, t + p.offsetHeight - vh)
    }
  }
  measure()
  window.addEventListener('resize', measure)

  function progressFor(y) {
    if (y <= bounds[0]) return 0
    for (let i = 0; i < bounds.length - 1; i++) {
      if (y < bounds[i + 1]) return i + (y - bounds[i]) / Math.max(1, bounds[i + 1] - bounds[i])
    }
    return bounds.length - 1
  }

  /* ---------- Pointer ---------- */

  const pointer = { x: 0, y: 0, tx: 0, ty: 0, px: -1e4, py: -1e4, inside: false, presence: 0 }
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return
    pointer.tx = (e.clientX / vw) * 2 - 1
    pointer.ty = -((e.clientY / vh) * 2 - 1)
    pointer.px = e.clientX
    pointer.py = e.clientY
    pointer.inside = true
  })
  const leave = () => {
    pointer.tx = 0
    pointer.ty = 0
    pointer.inside = false
  }
  document.documentElement.addEventListener('mouseleave', leave)
  window.addEventListener('blur', leave)

  let clicks = 0
  window.addEventListener('click', (e) => {
    if (e.target.closest('a, button, .card, .allwork__panel')) return
    clicks++
  })

  // Primary buttons lean toward the pointer.
  for (const btn of document.querySelectorAll('.btn--primary')) {
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect()
      const x = (e.clientX - (r.left + r.width / 2)) * 0.25
      const y = (e.clientY - (r.top + r.height / 2)) * 0.35
      btn.style.translate = `${x}px ${y}px`
    })
    btn.addEventListener('pointerleave', () => (btn.style.translate = '0 0'))
  }

  /* ---------- In-page links: jump straight to a readable pose ---------- */

  let snap = true
  function readingY(id) {
    if (id === 'intro') return 0
    if (id === 'about') return about.getBoundingClientRect().top + window.scrollY
    const i = projects.findIndex((p) => p.id === id)
    if (i < 0) return null
    return bounds[2 + i * 2] + (bounds[3 + i * 2] - bounds[2 + i * 2]) * 0.3
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]')
    if (!a) return
    const id = a.getAttribute('href').slice(1)
    const y = readingY(id)
    if (y == null) return
    e.preventDefault()
    snap = true
    window.scrollTo({ top: y, behavior: 'instant' })
    history.replaceState(null, '', `#${id}`)
  })
  // Keyboard focus moving into a card that is not on screen yet brings its scene up.
  document.addEventListener('focusin', (e) => {
    const card = e.target.closest('.card')
    if (!card) return
    const i = cards.indexOf(card)
    const y = window.scrollY
    if (y < bounds[2 + i * 2] || y > bounds[3 + i * 2]) {
      snap = true
      window.scrollTo({ top: readingY(projects[i].id), behavior: 'instant' })
    }
  })
  if (location.hash) {
    const y = readingY(location.hash.slice(1))
    if (y != null) window.scrollTo({ top: y, behavior: 'instant' })
  }

  /* ---------- Frame ---------- */

  let g = progressFor(window.scrollY)
  let last = performance.now()
  const startTime = last
  const cursorPos = { x: -100, y: -100 }
  const SCENES = ['00 · Intro', '01 · SyncDocs', '02 · Clipboard Sync', '03 · Final Transmission', '04 · Still Pavilion']
  const ACTIONS = [null, 'Click · write a line', 'Click · copy', 'Move · turn the planet', 'Move · change the light']
  // Cumulative scale of each world relative to the instrument's world.
  const worldScale = [1]
  for (let k = 1; k < worlds.length; k++) worldScale[k] = worldScale[k - 1] * worlds[k - 1].embed.s
  const camPos = new THREE.Vector3()
  const camDir = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3()
  const camUp = new THREE.Vector3()
  const upLocal = new THREE.Vector3()
  const lookM = new THREE.Matrix4()
  const camQuat = new THREE.Quaternion()
  const state = { g: 0, world: 0, target: 0 }

  let lensHover = 0
  let focusNow = 1
  function frame(now) {
    lensHover = 0
    // rAF timestamps can precede performance.now() taken at startup; never go negative.
    const rawDt = Math.min(0.5, Math.max(0, (now - last) / 1000))
    // Smoothing below is exponential, so real elapsed time keeps it frame-rate independent.
    const dt = rawDt
    last = now
    const time = now / 1000

    const y = window.scrollY
    const target = progressFor(y)
    if (snap || Math.abs(target - g) > 1.5) {
      g = target
      snap = false
    } else {
      g += (target - g) * (1 - Math.exp(-dt * 9))
      if (Math.abs(target - g) < 1e-4) g = target
    }

    const ease = 1 - Math.exp(-dt * 4)
    pointer.x += (pointer.tx - pointer.x) * ease
    pointer.y += (pointer.ty - pointer.y) * ease
    pointer.presence += ((pointer.inside ? 1 : 0) - pointer.presence) * (1 - Math.exp(-dt * 6))

    /* Camera pose from the track, plus a small orbit from the pointer. */
    const p = track.evaluate(g)
    camPos.copy(p.pos)
    camDir.copy(p.dir)
    let world = p.world

    // "Up" during a transit turns from the outer world's up to the inner
    // world's, so the horizon never jumps at either end or at the crossing.
    upLocal.copy(up)
    if (p.transit) {
      const outerUp = up.clone().applyQuaternion(worlds[p.transit.from].embed.Qi)
      upLocal.copy(outerUp).lerp(up, p.e).normalize()
    }

    right.crossVectors(camDir, upLocal).normalize()
    camUp.crossVectors(right, camDir).normalize()
    const strength = THREE.MathUtils.lerp(0.075, 0.03, smooth(0.6, 1.4, g))
    const focus = p.focus
    focusNow = focus
    const focusPoint = tmp.copy(camPos).addScaledVector(camDir, focus)
    camPos.addScaledVector(right, pointer.x * strength * focus).addScaledVector(camUp, pointer.y * strength * 0.7 * focus)
    camDir.copy(focusPoint).sub(camPos).normalize()
    lookM.lookAt(camPos, tmp.copy(camPos).add(camDir), upLocal)
    camQuat.setFromRotationMatrix(lookM)

    // During a transit the pose is in the inner world. While the camera is
    // still in front of the portal, express it in the outer world instead.
    if (p.transit) {
      const outer = worlds[p.transit.from]
      if (camPos.z * outer.embed.s > outer.near * 2) {
        world = p.transit.from
        camPos.copy(toOuter(outer, camPos))
        camQuat.premultiply(outer.embed.Q)
      }
    }

    const active = cams[world]
    active.position.copy(camPos)
    active.near = worlds[world].near
    active.far = worlds[world].far
    active.quaternion.copy(camQuat)
    active.updateProjectionMatrix()
    active.updateMatrixWorld()

    const depth = Math.min(2, worlds.length - 1 - world)
    for (let j = 1; j <= depth; j++) {
      const outer = worlds[world + j - 1]
      const c = cams[world + j]
      const prev = cams[world + j - 1]
      c.position.copy(toInner(outer, prev.position))
      c.quaternion.copy(outer.embed.Qi).multiply(prev.quaternion)
      c.near = prev.near / outer.embed.s
      c.far = prev.far / outer.embed.s
      c.updateProjectionMatrix()
      c.updateMatrixWorld()
    }

    const aboutTopNow = about.getBoundingClientRect().top

    /* Portal uniforms. */
    const pr = renderer.getPixelRatio()
    const sceneCtx = { active: false, pointer, dt, rawDt, clicks: 0 }
    for (let j = 0; j <= depth; j++) {
      const w = worlds[world + j]
      sceneCtx.active = j === 0 && aboutTopNow > vh * 0.3
      sceneCtx.clicks = sceneCtx.active ? clicks : 0
      w.tick(time, sceneCtx)
      if (!w.portal) continue
      const u = w.portal.uniforms
      const c = cams[world + j]
      const P = w.embed.P
      // Camera position in the portal's own frame, in this world's units.
      const local = toInner(w, c.position).multiplyScalar(w.embed.s)
      const dist = local.z
      u.uRes.value.copy(bufferSize)
      u.uTime.value = time
      u.uFade.value = smooth(0.12, 1.5, dist / w.portal.extent)
      u.uHasScene.value = j < depth ? 1 : 0
      u.tScene.value = j < depth ? targets[j + 1].texture : null
      u.uGlint.value.set(pointer.x + local.x / Math.max(dist, 1e-3), pointer.y + local.y / Math.max(dist, 1e-3))

      if (j === 0) {
        // Pointer lens only on the portal that is the next target.
        const center = P.clone().project(c)
        const edge = P.clone().add(new THREE.Vector3(w.portal.extent, 0, 0).applyQuaternion(w.embed.Q)).project(c)
        const cx = (center.x * 0.5 + 0.5) * vw
        const cy = (-center.y * 0.5 + 0.5) * vh
        const rpx = Math.abs(edge.x - center.x) * 0.5 * vw
        const d = Math.hypot(pointer.px - cx, pointer.py - cy)
        const want = center.z < 1 ? (1 - smooth(rpx * 0.85, rpx * 1.5 + 30, d)) * pointer.presence : 0
        u.uHover.value += (want - u.uHover.value) * (1 - Math.exp(-dt * 7))
        u.uPointer.value.set(pointer.px * pr, (vh - pointer.py) * pr)
        u.uPointerR.value = THREE.MathUtils.clamp(rpx * 0.5, 90, 240) * pr
        lensHover = u.uHover.value
      } else {
        u.uHover.value = 0
      }
      // The instrument's aperture opens on load, dilates under the pointer and
      // opens fully as the camera dives in.
      if (world + j === 0) {
        const intro = smooth(0.2, 2.2, (now - startTime) / 1000)
        const closed = THREE.MathUtils.lerp(1, 0.6, intro)
        const iris = closed * (1 - 0.88 * (j === 0 ? u.uHover.value : 0)) * (1 - smooth(0.55, 1.3, g))
        u.uIris.value = iris + Math.sin(time * 1.3) * 0.012 * iris
      } else {
        u.uIris.value = 0
      }
    }

    clicks = 0

    /* Render deepest first so each portal can sample the world behind it. */
    const aboutTop = about.getBoundingClientRect().top
    if (aboutTop > 0) {
      for (let j = depth; j >= 0; j--) {
        renderer.setRenderTarget(targets[j])
        renderer.render(worlds[world + j].scene, cams[world + j])
      }
      renderer.setRenderTarget(null)
    }
    canvas.style.opacity = String(smooth(vh * 0.05, vh * 0.7, aboutTop))

    /* HTML layers follow the raw scroll so text never lags. */
    const raw = target
    heroCopy.style.opacity = String(1 - smooth(1.0, 1.28, raw))
    heroCopy.style.transform = `translateY(${-smooth(1.0, 1.4, raw) * 40}px)`
    cards.forEach((card, i) => {
      const a = 2 + i * 2
      const lp = (raw - a) / 1
      const o = smooth(-0.32, 0.02, lp) * (1 - smooth(0.9, 1.25, lp))
      card.style.opacity = String(o)
      card.style.transform = `translateY(${(1 - smooth(-0.32, 0.05, lp)) * 24}px)`
      // Stay in the tab order even when faded; focusing a card brings its scene up.
      card.style.pointerEvents = o < 0.05 ? 'none' : 'auto'
    })
    const dark = worlds[world].dark && aboutTop > vh * 0.15
    masthead.classList.toggle('is-dark', dark)
    rail.classList.toggle('is-dark', dark)
    const current = aboutTop < vh * 0.5 ? 5 : raw < 1.5 ? 0 : raw < 3.5 ? 1 : raw < 5.5 ? 2 : raw < 7.5 ? 3 : 4
    railItems.forEach((li, i) => li.classList.toggle('is-current', i === current))

    const scale = worldScale[world]
    const mag = (worlds[0] && 16.5) / Math.max(1e-9, focusNow * scale)
    hudScene.textContent = current === 5 ? '05 · About' : SCENES[Math.min(4, current)]
    hudMag.textContent = mag < 100 ? `×${mag.toFixed(1)}` : `×${Math.round(mag).toLocaleString('en-US')}`
    hudDepth.textContent = (g * 1.0).toFixed(2)
    hudBar.style.width = `${(g / (bounds.length - 1)) * 100}%`
    hud.classList.toggle('is-dark', dark)
    hud.style.opacity = String(smooth(0, vh * 0.4, aboutTop))

    if (finePointer) {
      cursorPos.x += (pointer.px - cursorPos.x) * Math.min(1, dt * 22)
      cursorPos.y += (pointer.py - cursorPos.y) * Math.min(1, dt * 22)
      cursor.style.transform = `translate(${cursorPos.x}px, ${cursorPos.y}px)`
      const over = document.elementFromPoint(pointer.px, pointer.py)
      const onLink = !!over?.closest('a, button')
      const onCard = !!over?.closest('.card, .masthead, .about')
      let label = ''
      if (onLink) label = ''
      else if (lensHover > 0.35) label = 'Aperture open'
      else if (current === 0 && raw < 0.9) label = ''
      else if (!onCard && current >= 1 && current <= 4 && Math.abs(raw - Math.round(raw / 2) * 2) < 0.95) label = ACTIONS[current]
      cursor.classList.toggle('is-link', onLink)
      cursor.classList.toggle('is-lens', !onLink && lensHover > 0.35)
      cursor.classList.toggle('is-dark', dark && !onCard)
      cursor.classList.toggle('has-label', !!label && pointer.inside)
      if (label) cursorLabel.textContent = label
      cursor.style.opacity = pointer.inside ? '1' : '0'
    }

    state.g = g
    state.target = target
    state.world = world
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  // Read-only hook for automated checks.
  window.__journey = {
    state,
    bounds: () => bounds.slice(),
    camera: () => ({ world: state.world, position: cams[state.world].position.toArray(), quaternion: cams[state.world].quaternion.toArray() }),
    // Where each transit's path crosses its portal plane, in portal half-sizes.
    crossings() {
      return track.segments
        .filter((s) => s.kind === 'transit')
        .map((s) => {
          const i = track.segments.indexOf(s)
          const half = worlds[s.from].portal.half
          const s0 = worlds[s.from].embed.s
          let prev = null
          for (let k = 0; k <= 4000; k++) {
            const q = track.evaluate(i + k / 4000)
            if (prev && prev.z > 0 && q.pos.z <= 0) {
              return { from: s.from, t: k / 4000, x: (q.pos.x * s0) / half.x, y: (q.pos.y * s0) / half.y }
            }
            prev = q.pos.clone()
          }
          return { from: s.from, t: null }
        })
    },
  }
}
