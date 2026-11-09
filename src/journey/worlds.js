import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createPortal, roundedRectShape } from './portal.js'
import {
  canvasTexture,
  imageTexture,
  radialTexture,
  savedPillTexture,
  ghostPageTexture,
  hudLabelTexture,
} from './textures.js'

/*
 * Five nested worlds. World k contains a portal (the bridge object) at
 * position P with scale s: a point p in world k+1 sits at P + s * p in world k.
 * Every inner world therefore has its entrance on the z = 0 plane, with its
 * content behind it (z < 0), facing a camera that arrives from +z.
 *
 * Each world also names its "target": the object that is visible through the
 * previous portal and grows into the scene as the camera falls toward it.
 */

const v = (x, y, z) => new THREE.Vector3(x, y, z)

function embed(P, s, Q = new THREE.Quaternion()) {
  return { P: P.clone(), s, Q: Q.clone(), Qi: Q.clone().invert() }
}

function envFor(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  return env
}

function lathe(points, segments = 160) {
  return new THREE.LatheGeometry(
    points.map(([r, z]) => new THREE.Vector2(r, z)),
    segments,
  ).rotateX(Math.PI / 2)
}

function ringInstances(count, geometry, material, place) {
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  const m = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    place(m, i)
    m.updateMatrix()
    mesh.setMatrixAt(i, m.matrix)
  }
  return mesh
}

/* ------------------------------------------------------------------ */
/* World 0: the optical instrument                                      */
/* ------------------------------------------------------------------ */

function buildInstrument(env) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#f2ede3')
  scene.environment = env
  scene.environmentIntensity = 0.9

  const key = new THREE.DirectionalLight('#fff6ea', 2.2)
  key.position.set(-4, 7, 9)
  scene.add(key, new THREE.AmbientLight('#f4efe6', 0.6))

  const G = v(3.9, 0.3, 0)
  const R = 2.45
  const inst = new THREE.Group()
  inst.position.copy(G)
  // Turned a little away from the camera so the barrel shows its depth.
  inst.rotation.set(-0.04, 0.3, 0)
  scene.add(inst)

  const polished = new THREE.MeshStandardMaterial({ color: '#30333a', metalness: 1, roughness: 0.24 })
  const satin = new THREE.MeshStandardMaterial({ color: '#53575f', metalness: 0.92, roughness: 0.4 })
  const bright = new THREE.MeshStandardMaterial({ color: '#d8dbe0', metalness: 1, roughness: 0.16 })
  const rubber = new THREE.MeshStandardMaterial({ color: '#141519', metalness: 0.2, roughness: 0.75 })
  const engraving = new THREE.MeshBasicMaterial({ color: '#e9e4da' })
  const cobalt = new THREE.MeshBasicMaterial({ color: '#2340d6' })

  // Front bezel with a chamfered lip.
  const bezel = new THREE.Mesh(
    lathe([
      [R + 0.02, -0.05],
      [R + 0.02, 0.3],
      [R + 0.13, 0.42],
      [3.0, 0.42],
      [3.13, 0.3],
      [3.13, -0.28],
    ]),
    polished,
  )
  bezel.material.side = THREE.DoubleSide
  inst.add(bezel)

  // Cobalt line just inside the bezel.
  const line = new THREE.Mesh(new THREE.RingGeometry(R - 0.005, R + 0.03, 160), cobalt)
  line.position.z = 0.004
  inst.add(line)

  // Engraved graduations on the bezel face.
  const tick = new THREE.BoxGeometry(0.016, 1, 0.01)
  inst.add(
    ringInstances(120, tick, engraving, (m, i) => {
      const a = (i / 120) * Math.PI * 2
      const long = i % 10 === 0
      const len = long ? 0.2 : i % 5 === 0 ? 0.13 : 0.08
      const r = 2.95 - len / 2
      m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.43)
      m.rotation.set(0, 0, a - Math.PI / 2)
      m.scale.set(long ? 1.6 : 1, len, 1)
    }),
  )

  // Engraved distance scale, like a cinema lens.
  const scaleTex = canvasTexture(2048, 128, (c, w, h) => {
    c.fillStyle = '#0d0e11'
    c.fillRect(0, 0, w, h)
    c.fillStyle = '#ece8df'
    c.textBaseline = 'middle'
    c.textAlign = 'center'
    const marks = ['∞', '30', '15', '10', '7', '5', '4', '3', '2.5', '2', '1.7', '1.5', '1.3', '1.2', '1.1', '1 m']
    marks.forEach((m, i) => {
      const x = (i + 0.5) * (w / marks.length)
      c.font = `500 ${m === '∞' ? 54 : 40}px "JetBrains Mono", monospace`
      c.fillText(m, x, h * 0.42)
      c.fillRect(x - 1.5, h * 0.78, 3, h * 0.22)
    })
    for (let x = 0; x < w; x += w / 64) c.fillRect(x - 1, h * 0.88, 2, h * 0.12)
  })
  scaleTex.wrapS = THREE.RepeatWrapping
  scaleTex.repeat.set(2, 1)
  scaleTex.colorSpace = THREE.SRGBColorSpace
  const scaleRing = new THREE.Mesh(
    new THREE.CylinderGeometry(3.16, 3.16, 0.46, 200, 1, true).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: scaleTex, metalness: 0.3, roughness: 0.45 }),
  )
  scaleRing.position.z = -0.55
  inst.add(scaleRing)
  const step = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.2, 160), bright)
  step.position.z = -0.3
  inst.add(step)
  const step2 = new THREE.Mesh(new THREE.TorusGeometry(3.18, 0.035, 10, 200), bright)
  step2.position.z = -0.82
  inst.add(step2)

  // Knurled focus ring.
  const focus = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.9, 160, 1, true).rotateX(Math.PI / 2), rubber)
  focus.position.z = -1.3
  inst.add(focus)
  inst.add(
    ringInstances(180, new THREE.BoxGeometry(0.045, 0.07, 0.86), rubber, (m, i) => {
      const a = (i / 180) * Math.PI * 2
      m.position.set(Math.cos(a) * 3.22, Math.sin(a) * 3.22, -1.3)
      m.rotation.set(0, 0, a)
    }),
  )

  // Red index dot on the bezel face.
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.075, 32), new THREE.MeshBasicMaterial({ color: '#d2382c' }))
  dot.position.set(0, 3.06, 0.425)
  inst.add(dot)

  // Front element: a thin glass dome that only shows reflections.
  const SAG = 0.32
  const RS = (R * R + SAG * SAG) / (2 * SAG)
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(RS, 128, 24, 0, Math.PI * 2, 0, Math.asin(R / RS)).rotateX(Math.PI / 2),
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      metalness: 0,
      roughness: 0.04,
      clearcoat: 1,
      transparent: true,
      opacity: 0.14,
      envMapIntensity: 2.2,
      depthWrite: false,
    }),
  )
  dome.position.z = SAG - RS + 0.01
  inst.add(dome)

  // Barrel and bands.
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(3.02, 3.02, 4.6, 160, 1, true).rotateX(Math.PI / 2), satin)
  barrel.position.z = -3.55
  inst.add(barrel)
  for (const z of [-2.35, -5.25]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(3.04, 0.04, 12, 200), bright)
    band.position.z = z
    inst.add(band)
  }
  const cap = new THREE.Mesh(new THREE.CircleGeometry(3.03, 96), rubber)
  cap.position.z = -5.85
  cap.rotation.y = Math.PI
  inst.add(cap)

  // Finder scope on the upper left of the barrel.
  const finder = new THREE.Group()
  finder.position.set(-2.62, 2.62, -2.6)
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 2.8, 64).rotateX(Math.PI / 2), satin)
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.5, 64, 1, true).rotateX(Math.PI / 2), polished)
  hood.position.z = 1.3
  hood.material = polished.clone()
  hood.material.side = THREE.DoubleSide
  const flens = new THREE.Mesh(new THREE.CircleGeometry(0.34, 48), new THREE.MeshStandardMaterial({ color: '#13205f', metalness: 1, roughness: 0.05 }))
  flens.position.z = 1.2
  finder.add(tube, hood, flens)
  for (const z of [-0.8, 0.7]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.28), polished)
    bracket.position.set(0.3, -0.3, z)
    bracket.rotation.z = Math.PI / 4
    finder.add(bracket)
  }
  inst.add(finder)

  // Mount: saddle, collar and a post that runs off the bottom of the frame.
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 2.8), polished)
  saddle.position.set(0, -3.2, -3.5)
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.45, 64), bright)
  collar.position.set(0, -3.75, -3.5)
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 14, 48), satin)
  post.position.set(0, -10.9, -3.5)
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 32).rotateZ(Math.PI / 2), bright)
  knob.position.set(0.85, -3.75, -3.5)
  inst.add(saddle, collar, post, knob)

  const portal = createPortal({ shape: 'circle', radius: R, smoke: 0.6, tint: '#0c0f17', rim: 1, sheen: 1 })
  inst.add(portal.mesh)

  return {
    name: 'instrument',
    scene,
    near: 0.03,
    far: 220,
    portal,
    embed: embed(G, 0.1, inst.quaternion),
    dark: false,
    tick() {
      // The glass fades as the camera reaches it, so nothing sits between it and the next scene.
      dome.material.opacity = 0.14 * portal.uniforms.uFade.value
      dome.visible = dome.material.opacity > 0.005
    },
  }
}

/* ------------------------------------------------------------------ */
/* World 1: SyncDocs                                                   */
/* ------------------------------------------------------------------ */

function buildSyncDocs(renderer) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#e8e6e1')

  const PAGE_Z = -40
  const W = 10
  const H = (10 * 1440) / 1634

  const paper = new THREE.MeshBasicMaterial({ color: '#f7f7f5' })
  const face = new THREE.MeshBasicMaterial({ map: imageTexture('/media/syncdocs-page.webp', renderer) })
  const page = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.06), [paper, paper, paper, paper, face, paper])
  page.position.set(0, 0, PAGE_Z)
  scene.add(page)

  const shadowTex = radialTexture('rgba(30,28,40,0.32)', 'rgba(30,28,40,0)')
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.35, H * 1.45),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  )
  shadow.position.set(0.35, -0.55, PAGE_Z - 0.6)
  scene.add(shadow)

  // Other documents, further back, give the space depth and parallax.
  const ghosts = [
    [-15, 7.5, -72, 0.9, 11],
    [17, -6.5, -80, 1, 23],
    [12, 10, -104, 1.1, 37],
    [-20, -9, -96, 1, 41],
    [-4, 13, -130, 1.2, 53],
  ]
  for (const [x, y, z, s, seed] of ghosts) {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(W * s, H * s),
      new THREE.MeshBasicMaterial({ map: ghostPageTexture(seed, renderer), transparent: true, opacity: 0.8 }),
    )
    g.position.set(x, y, z)
    scene.add(g)
  }

  const pillTex = savedPillTexture(renderer)
  const pill = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.71), new THREE.MeshBasicMaterial({ map: pillTex, transparent: true }))
  pill.position.set(3.3, H / 2 + 0.62, PAGE_Z)
  scene.add(pill)

  // Lines typed live onto the blank lower half of the page.
  const inkTex = canvasTexture(800, 300, () => {}, renderer)
  const inkCtx = inkTex.image.getContext('2d')
  const writing = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 3),
    // Offset so it never z-fights with the page face just behind it.
    new THREE.MeshBasicMaterial({ map: inkTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  )
  writing.position.set(0.15, -2.35, PAGE_Z + 0.042)
  scene.add(writing)
  const pool = [
    'Context switch: save registers, swap the page table.',
    'Thrashing: too many faults, too little RAM.',
    'Lab: measure the TLB size with a timing loop.',
    'Read OSTEP chapters 18 to 20 before Friday.',
    'Huge pages mean fewer TLB entries per GB.',
  ]
  const doc = { lines: [], typing: null, chars: 0, status: 'saved', since: 0, nextLine: 0, auto: false, caret: true, dirty: true }
  function drawInk() {
    const c = inkCtx
    // Opaque white like the page underneath: no alpha fringes on the text.
    c.fillStyle = '#ffffff'
    c.fillRect(0, 0, 800, 300)
    c.font = '400 23px Inter, system-ui, sans-serif'
    c.fillStyle = '#1d1f24'
    c.textBaseline = 'top'
    const rows = [...doc.lines]
    if (doc.typing != null) rows.push(pool[doc.typing].slice(0, doc.chars))
    rows.forEach((text, i) => c.fillText(text, 0, 10 + i * 39))
    if (doc.caret && doc.typing != null) {
      const last = rows[rows.length - 1]
      const x = c.measureText(last).width + 2
      c.fillStyle = '#2340d6'
      c.fillRect(x, 10 + (rows.length - 1) * 39, 2, 26)
    }
    inkTex.needsUpdate = true
  }
  function drawPill() {
    const c = pillTex.image.getContext('2d')
    const w = pillTex.image.width
    const h = pillTex.image.height
    const look = {
      saved: ['#e8f8ee', '#16703e', 'Saved'],
      unsaved: ['#fff4dc', '#9a5b00', 'Unsaved changes'],
      saving: ['#eef0f4', '#4b5160', 'Saving…'],
    }[doc.status]
    c.clearRect(0, 0, w, h)
    c.font = '600 44px Inter, system-ui, sans-serif'
    const tw = c.measureText(look[2]).width
    const pw = tw + 140
    c.beginPath()
    c.roundRect(w - pw - 4, 4, pw, h - 8, (h - 8) / 2)
    c.fillStyle = look[0]
    c.fill()
    c.fillStyle = look[1]
    c.beginPath()
    c.arc(w - pw + 52, h / 2, 9, 0, Math.PI * 2)
    c.fill()
    c.textBaseline = 'middle'
    c.fillText(look[2], w - pw + 82, h / 2 + 2)
    pillTex.needsUpdate = true
  }
  drawPill()
  function write() {
    if (doc.typing != null) return
    if (doc.lines.length >= 3) doc.lines = []
    doc.typing = doc.nextLine
    doc.nextLine = (doc.nextLine + 1) % pool.length
    doc.chars = 0
    doc.status = 'unsaved'
    drawPill()
  }

  // Copy glyph in the right margin: two overlapping rounded squares.
  const GLYPH = v(3.9, 3.05, PAGE_Z + 0.05)
  const S = 0.42
  const ink = new THREE.MeshBasicMaterial({ color: '#202228' })
  const outline = (size, stroke) => {
    const shape = roundedRectShape(size + stroke, size + stroke, 0.09)
    shape.holes.push(roundedRectShape(size - stroke, size - stroke, 0.06))
    return new THREE.ShapeGeometry(shape, 10)
  }
  const back = new THREE.Mesh(outline(S, 0.05), ink)
  back.position.set(GLYPH.x - 0.12, GLYPH.y + 0.12, PAGE_Z + 0.035)
  const front = new THREE.Mesh(outline(S, 0.05), ink)
  front.position.set(GLYPH.x, GLYPH.y, PAGE_Z + 0.045)
  // Hide the back square where the front one covers it.
  const mask = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(S + 0.05, S + 0.05, 0.09)), paper)
  mask.position.set(GLYPH.x, GLYPH.y, PAGE_Z + 0.04)
  scene.add(back, mask, front)

  const hint = new THREE.Mesh(
    new THREE.RingGeometry(0.46, 0.475, 96),
    new THREE.MeshBasicMaterial({ color: '#2340d6', transparent: true, opacity: 0.5 }),
  )
  hint.position.set(GLYPH.x, GLYPH.y, PAGE_Z + 0.04)
  scene.add(hint)

  const portal = createPortal({
    shape: 'rect',
    width: S - 0.05,
    height: S - 0.05,
    corner: 0.06,
    smoke: 0.12,
    tint: '#0b0f1f',
    rim: 0.8,
    sheen: 0.6,
  })
  portal.mesh.position.copy(GLYPH)
  scene.add(portal.mesh)

  return {
    name: 'syncdocs',
    scene,
    near: 0.02,
    far: 500,
    portal,
    target: v(0, 0, PAGE_Z),
    embed: embed(GLYPH, (S - 0.05) / 20),
    dark: false,
    tick(t, ctx) {
      const k = (t * 0.5) % 1
      hint.scale.setScalar(1 + k * 0.7)
      hint.material.opacity = 0.55 * (1 - k)
      if (ctx.active) {
        if (!doc.auto) {
          doc.auto = true
          doc.since = t
        }
        if (ctx.clicks) write()
        // One line writes itself shortly after arriving, so the page is visibly alive.
        if (doc.lines.length === 0 && doc.typing == null && t - doc.since > 1.2) write()
      }
      if (doc.typing != null) {
        const n = Math.min(pool[doc.typing].length, doc.chars + ctx.rawDt * 26)
        if (Math.floor(n) !== Math.floor(doc.chars)) doc.dirty = true
        doc.chars = n
        if (n >= pool[doc.typing].length) {
          doc.lines.push(pool[doc.typing])
          doc.typing = null
          doc.since = t
          doc.dirty = true
        }
      } else if (doc.status === 'unsaved' && t - doc.since > 0.8) {
        doc.status = 'saving'
        doc.since = t
        drawPill()
      } else if (doc.status === 'saving' && t - doc.since > 0.7) {
        doc.status = 'saved'
        drawPill()
      }
      const caret = Math.floor(t * 2.2) % 2 === 0
      if (caret !== doc.caret) {
        doc.caret = caret
        doc.dirty = true
      }
      if (doc.dirty) {
        drawInk()
        doc.dirty = false
      }
    },
  }
}

/* ------------------------------------------------------------------ */
/* World 2: Universal Clipboard Sync                                   */
/* ------------------------------------------------------------------ */

const signalVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const signalFragment = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float s = vUv.x * uLength;
    float dash = smoothstep(0.55, 1.0, fract(s * 0.35 - uTime * 0.9));
    vec3 col = mix(uColor * 0.7, vec3(0.92, 0.95, 1.0), dash);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`
// Floor: fine grid that fades out, with a soft cobalt pool of light.
const floorVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const floorFragment = /* glsl */ `
  uniform vec3 uCenter;
  varying vec3 vWorld;
  float line(float x, float w) {
    float f = abs(fract(x) - 0.5);
    float d = fwidth(x);
    return 1.0 - smoothstep(w * d, (w + 1.0) * d, 0.5 - f);
  }
  void main() {
    vec2 p = vWorld.xz;
    float r = length(p - uCenter.xz);
    float grid = max(line(p.x * 0.5, 1.0), line(p.y * 0.5, 1.0));
    float fade = exp(-r * 0.035);
    vec3 base = vec3(0.028, 0.035, 0.075);
    vec3 col = base + vec3(0.12, 0.17, 0.5) * grid * 0.22 * fade;
    col += vec3(0.09, 0.13, 0.45) * exp(-r * r * 0.004) * 0.35;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

const CLIPS = [
  'Lab at 4 pm, room 204',
  'git clone github.com/recurshiv/clipboard_sync',
  'Bring the HDMI adapter',
  'ssh shivansh@lab-07',
  'Week 6 notes: paging and the TLB',
  'Meet at the library, 6:30',
]

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

function drawClipScreen(ctx, w, h, role, current, history) {
  ctx.fillStyle = '#0d1122'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#141a33'
  ctx.fillRect(0, 0, w, 70)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#e9ecf8'
  ctx.font = '600 28px Inter, system-ui, sans-serif'
  ctx.fillText('Universal Clipboard', 30, 36)
  ctx.fillStyle = '#5bd38a'
  ctx.beginPath()
  ctx.arc(w - 236, 36, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#a9b3d6'
  ctx.font = '500 22px "JetBrains Mono", monospace'
  ctx.fillText(role === 'a' ? 'desk-a → desk-b' : 'desk-b ← desk-a', w - 218, 36)

  const colW = role === 'a' ? w - 60 : 490
  ctx.fillStyle = '#8f9bc7'
  ctx.font = '500 19px "JetBrains Mono", monospace'
  ctx.fillText(role === 'a' ? 'COPIED HERE' : 'RECEIVED', 30, 108)
  ctx.beginPath()
  ctx.roundRect(30, 128, colW, 150, 14)
  ctx.fillStyle = '#1a2347'
  ctx.fill()
  ctx.strokeStyle = '#4d66ff'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = '#f2f4fb'
  ctx.font = '500 32px Inter, system-ui, sans-serif'
  wrapText(ctx, current, colW - 52)
    .slice(0, 2)
    .forEach((l, i) => ctx.fillText(l, 56, 178 + i * 42))
  ctx.fillStyle = '#8f9bc7'
  ctx.font = '500 19px "JetBrains Mono", monospace'
  ctx.fillText('HISTORY', 30, 318)
  history.slice(0, 4).forEach((text, i) => {
    const y = 338 + i * 72
    ctx.beginPath()
    ctx.roundRect(30, y, colW, 58, 10)
    ctx.fillStyle = '#131a33'
    ctx.fill()
    ctx.fillStyle = '#5e72e4'
    ctx.fillRect(48, y + 19, 20, 20)
    ctx.fillStyle = '#cdd3e8'
    ctx.font = '400 24px Inter, system-ui, sans-serif'
    const t = text.length > 34 ? `${text.slice(0, 33)}…` : text
    ctx.fillText(t, 84, y + 30)
  })
  if (role === 'b') {
    ctx.fillStyle = '#8f9bc7'
    ctx.font = '500 19px "JetBrains Mono", monospace'
    ctx.fillText('LAST IMAGE', 560, 108)
    ctx.strokeStyle = '#4d66ff'
    ctx.lineWidth = 3
    ctx.strokeRect(558, 128, 474, 298)
    ctx.fillStyle = '#a9b3d6'
    ctx.font = '400 21px "JetBrains Mono", monospace'
    ctx.fillText('final-transmission.png · 1600×1000', 560, 456)
  }
}

function buildClipboard(renderer, env) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#070a16')
  scene.environment = env
  scene.environmentIntensity = 0.5
  scene.add(new THREE.AmbientLight('#8fa2ff', 0.35))
  const key = new THREE.DirectionalLight('#e6ebff', 1.6)
  key.position.set(-6, 10, 10)
  const rimLight = new THREE.DirectionalLight('#4d66ff', 2.2)
  rimLight.position.set(6, 4, -12)
  scene.add(key, rimLight)

  const Z = -34
  const FLOOR = -1.32
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.ShaderMaterial({ uniforms: { uCenter: { value: v(0, FLOOR, Z) } }, vertexShader: floorVertex, fragmentShader: floorFragment }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = FLOOR
  scene.add(floor)

  // Drifting dust.
  const dustN = 500
  const dust = new Float32Array(dustN * 3)
  let seed = 3
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < dustN; i++) {
    dust[i * 3] = (rand() - 0.5) * 60
    dust[i * 3 + 1] = FLOOR + rand() * 16
    dust[i * 3 + 2] = Z + 18 - rand() * 60
  }
  const dustGeo = new THREE.BufferGeometry()
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3))
  const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#9fb0ff', size: 0.05, transparent: true, opacity: 0.6 }))
  scene.add(dustPts)

  const shell = new THREE.MeshStandardMaterial({ color: '#4a4f5c', metalness: 0.9, roughness: 0.32 })
  const bezel = new THREE.MeshStandardMaterial({ color: '#0c0e14', metalness: 0.4, roughness: 0.4 })
  const keysTex = canvasTexture(
    512,
    200,
    (c, w, h) => {
      c.fillStyle = '#20232b'
      c.fillRect(0, 0, w, h)
      c.fillStyle = '#121419'
      for (let r = 0; r < 5; r++) for (let k = 0; k < 14; k++) c.fillRect(8 + k * 35.5, 8 + r * 37, 30, 31)
    },
    renderer,
  )
  const glowTex = radialTexture('rgba(77,102,255,0.55)', 'rgba(77,102,255,0)')

  const screens = {}
  const laptop = (x, ry, role) => {
    const g = new THREE.Group()
    g.position.set(x, FLOOR + 0.08, Z)
    g.rotation.y = ry
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.16, 3.7), shell)
    const keys = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 1.9), new THREE.MeshBasicMaterial({ map: keysTex }))
    keys.rotation.x = -Math.PI / 2
    keys.position.set(0, 0.081, -0.45)
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.0), new THREE.MeshStandardMaterial({ color: '#3b404c', metalness: 0.8, roughness: 0.25 }))
    pad.rotation.x = -Math.PI / 2
    pad.position.set(0, 0.082, 1.15)
    g.add(base, keys, pad)

    const lid = new THREE.Group()
    lid.position.set(0, 0.08, -1.82)
    lid.rotation.x = -0.16
    const back = new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.6, 0.1), shell)
    back.position.y = 1.8
    const front = new THREE.Mesh(new THREE.PlaneGeometry(5.56, 3.56), bezel)
    front.position.set(0, 1.8, 0.051)
    const tex = canvasTexture(1060, 660, () => {}, renderer)
    const display = new THREE.Mesh(new THREE.PlaneGeometry(5.3, 3.3), new THREE.MeshBasicMaterial({ map: tex }))
    display.position.set(0, 1.86, 0.053)
    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(5.3, 3.3),
      new THREE.MeshBasicMaterial({ color: '#4d66ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    flash.position.set(0, 1.86, 0.056)
    lid.add(back, front, display, flash)
    g.add(lid)

    const pool = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    pool.rotation.x = -Math.PI / 2
    pool.position.set(0, -0.07, -0.6)
    g.add(pool)
    scene.add(g)
    screens[role] = { group: g, lid, display, tex, flash }
    return g
  }
  laptop(-4.5, 0.32, 'a')
  laptop(4.5, -0.32, 'b')
  scene.updateMatrixWorld(true)

  // The received-image slot on desk-b's screen is the portal to the next scene.
  const portal = createPortal({ shape: 'rect', width: 2.35, height: 1.47, corner: 0.02, smoke: 0.04, tint: '#0a0d0a', rim: 0.2, rimColor: '#4d66ff', sheen: 0 })
  portal.mesh.position.set((795 - 530) * 0.005, 1.86 + (330 - 277) * 0.005, 0.057)
  screens.b.lid.add(portal.mesh)
  scene.updateMatrixWorld(true)
  const portalP = portal.mesh.getWorldPosition(new THREE.Vector3())
  const portalQ = portal.mesh.getWorldQuaternion(new THREE.Quaternion())

  // Signal arc between the two screens.
  const from = screens.a.lid.localToWorld(v(2.55, 3.2, 0.1))
  const to = screens.b.lid.localToWorld(v(-2.55, 3.2, 0.1))
  const arc = new THREE.CatmullRomCurve3([from, v(-1.6, 5.4, Z + 0.4), v(1.6, 5.4, Z + 0.4), to])
  const signal = new THREE.Mesh(
    new THREE.TubeGeometry(arc, 200, 0.035, 8),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLength: { value: arc.getLength() }, uColor: { value: new THREE.Color('#4d66ff') } },
      vertexShader: signalVertex,
      fragmentShader: signalFragment,
    }),
  )
  const halo = new THREE.Mesh(
    new THREE.TubeGeometry(arc, 200, 0.16, 12),
    new THREE.MeshBasicMaterial({ color: '#4d66ff', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  scene.add(signal, halo)

  // The clip itself: a glowing card that flies along the arc.
  const clipTex = canvasTexture(640, 150, () => {}, renderer)
  const clip = new THREE.Group()
  const clipCard = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.49), new THREE.MeshBasicMaterial({ map: clipTex, transparent: true, depthWrite: false }))
  const clipGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.6), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  clipGlow.position.z = -0.01
  clip.add(clipGlow, clipCard)
  clip.visible = false
  scene.add(clip)

  const state = { index: 0, received: 0, historyA: [], historyB: [], flight: null, lastCopy: -10, flashA: -10, flashB: -10 }
  function redraw(role) {
    const s = screens[role]
    const ctx = s.tex.image.getContext('2d')
    if (role === 'a') drawClipScreen(ctx, 1060, 660, 'a', CLIPS[state.index], state.historyA)
    else drawClipScreen(ctx, 1060, 660, 'b', CLIPS[state.received], state.historyB)
    s.tex.needsUpdate = true
  }
  function drawClip(text) {
    const c = clipTex.image.getContext('2d')
    c.clearRect(0, 0, 640, 150)
    c.beginPath()
    c.roundRect(4, 4, 632, 142, 26)
    c.fillStyle = '#f4f6ff'
    c.fill()
    c.fillStyle = '#1b2350'
    c.font = '600 40px Inter, system-ui, sans-serif'
    c.textBaseline = 'middle'
    const t = text.length > 24 ? `${text.slice(0, 23)}…` : text
    c.fillText(t, 34, 78)
    clipTex.needsUpdate = true
  }
  redraw('a')
  redraw('b')

  function copy(t) {
    state.historyA.unshift(CLIPS[state.index])
    state.index = (state.index + 1) % CLIPS.length
    redraw('a')
    drawClip(CLIPS[state.index])
    state.flight = { start: t, index: state.index }
    state.lastCopy = t
    state.flashA = t
  }

  return {
    name: 'clipboard',
    scene,
    near: 0.05,
    far: 900,
    portal,
    target: v(0, 1.6, Z),
    embed: embed(portalP, 2.35 / 32, portalQ),
    dark: true,
    tick(t, ctx) {
      // Copy something new on click, and every few seconds on its own.
      if (ctx.active && (ctx.clicks || t - state.lastCopy > 4.2) && !state.flight) copy(t)
      signal.material.uniforms.uTime.value = t * (state.flight ? 3 : 1)
      dustPts.rotation.y = t * 0.01
      if (state.flight) {
        const u = (t - state.flight.start) / 1.3
        if (u >= 1) {
          state.historyB.unshift(CLIPS[state.received])
          state.received = state.flight.index
          redraw('b')
          state.flight = null
          state.flashB = t
          clip.visible = false
        } else {
          const e = u * u * (3 - 2 * u)
          clip.visible = true
          clip.position.copy(arc.getPointAt(e))
          clip.position.y += 0.35
          clip.scale.setScalar(0.6 + Math.sin(Math.PI * e) * 0.6)
        }
      }
      screens.a.flash.material.opacity = 0.35 * Math.exp(-Math.max(0, t - state.flashA) * 4)
      screens.b.flash.material.opacity = 0.45 * Math.exp(-Math.max(0, t - state.flashB) * 3)
      halo.material.opacity = 0.1 + (state.flight ? 0.12 : 0)
    },
  }
}

/* ------------------------------------------------------------------ */
/* World 3: Final Transmission                                          */
/* ------------------------------------------------------------------ */

const planetVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vWorld;
  void main() {
    vN = normal;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const planetFragment = /* glsl */ `
  uniform float uRot;
  uniform float uTilt;
  uniform float uTime;
  uniform vec3 uSpot;
  varying vec3 vN;
  varying vec3 vWorld;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }

  void main() {
    vec3 n = normalize(vN);
    float cy = cos(uRot), sy = sin(uRot), cx = cos(uTilt), sx = sin(uTilt);
    vec3 p = vec3(cy * n.x + sy * n.z, n.y, -sy * n.x + cy * n.z);
    p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);

    float c = fbm(p * 2.1);
    float land = smoothstep(0.47, 0.53, c);
    vec3 col = mix(vec3(0.01, 0.02, 0.015), vec3(0.06, 0.11, 0.045), land);
    float ridge = 1.0 - abs(fbm(p * 4.5 + 3.1) * 2.0 - 1.0);
    col = mix(col, vec3(1.0, 0.32, 0.12), smoothstep(0.955, 0.992, ridge) * land);
    float clouds = smoothstep(0.56, 0.78, fbm(p * 3.2 + vec3(uTime * 0.015)));
    col = mix(col, vec3(0.5, 0.56, 0.46), clouds * 0.3);

    float lit = clamp(dot(n, normalize(vec3(-0.5, 0.45, 0.75))) * 0.9 + 0.25, 0.08, 1.0);
    col *= lit;

    // A fixed bright patch of cloud: the way through to the next scene.
    float d = dot(n, uSpot) + (fbm(n * 7.0 + uTime * 0.02) - 0.5) * 0.035;
    float spot = smoothstep(0.935, 0.975, d);
    col = mix(col, vec3(1.0, 0.985, 0.95), spot);
    col += vec3(1.0, 0.95, 0.85) * smoothstep(0.86, 0.975, d) * 0.25;

    vec3 V = normalize(cameraPosition - vWorld);
    float fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    col += vec3(0.45, 0.8, 0.3) * fr * 0.55;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

function buildFinalTransmission(renderer) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#060906')

  const n = 2600
  const pos = new Float32Array(n * 3)
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rand() - 0.5) * 700
    pos[i * 3 + 1] = (rand() - 0.5) * 450
    pos[i * 3 + 2] = -70 - rand() * 600
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#cfd8bf', size: 1.1, sizeAttenuation: true })))

  // The site capture on a large display.
  const SCREEN = v(-1, 0.4, -48)
  const SW = 15
  const SH = 9.375
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: imageTexture('/media/final-transmission.webp', renderer) }))
  screen.position.copy(SCREEN)
  scene.add(screen)
  const lime = new THREE.LineBasicMaterial({ color: '#d4f25c' })
  const corners = []
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = SCREEN.x + sx * (SW / 2 + 0.4)
    const cy = SCREEN.y + sy * (SH / 2 + 0.4)
    corners.push(cx, cy - sy * 1.1, SCREEN.z, cx, cy, SCREEN.z, cx, cy, SCREEN.z, cx - sx * 1.1, cy, SCREEN.z)
  }
  const cornerGeo = new THREE.BufferGeometry()
  cornerGeo.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3))
  scene.add(new THREE.LineSegments(cornerGeo, lime))
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 0.5625),
    new THREE.MeshBasicMaterial({ map: hudLabelTexture('SIGNAL 03 · FINAL TRANSMISSION · 3027', '#d4f25c', renderer), transparent: true }),
  )
  label.position.set(SCREEN.x - 3, SCREEN.y + SH / 2 + 1.1, SCREEN.z)
  scene.add(label)

  // The planet. A bright patch of cloud on it is the way into the next scene.
  const PC = v(13, 8.5, -70)
  const PR = 7
  const spotDir = new THREE.Vector3(-0.45, 0.15, 0.88).normalize()
  const planetMat = new THREE.ShaderMaterial({
    uniforms: { uRot: { value: 0 }, uTilt: { value: 0 }, uTime: { value: 0 }, uSpot: { value: spotDir } },
    vertexShader: planetVertex,
    fragmentShader: planetFragment,
  })
  const planet = new THREE.Mesh(new THREE.SphereGeometry(PR, 128, 96), planetMat)
  planet.position.copy(PC)
  scene.add(planet)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(PR * 1.55, 0.09, 8, 320), new THREE.MeshBasicMaterial({ color: '#ff6a3d' }))
  ring.position.copy(PC)
  ring.rotation.set(1.42, 0.35, 0.5)
  scene.add(ring)
  const debris = new Float32Array(900 * 3)
  for (let i = 0; i < 900; i++) {
    const a = rand() * Math.PI * 2
    const r = PR * (1.4 + rand() * 0.35)
    debris[i * 3] = Math.cos(a) * r
    debris[i * 3 + 1] = (rand() - 0.5) * 0.5
    debris[i * 3 + 2] = Math.sin(a) * r
  }
  const debrisGeo = new THREE.BufferGeometry()
  debrisGeo.setAttribute('position', new THREE.BufferAttribute(debris, 3))
  const debrisPts = new THREE.Points(debrisGeo, new THREE.PointsMaterial({ color: '#8fae6a', size: 0.12 }))
  const debrisGroup = new THREE.Group()
  debrisGroup.position.copy(PC)
  debrisGroup.rotation.copy(ring.rotation)
  debrisGroup.rotateX(Math.PI / 2)
  debrisGroup.add(debrisPts)
  scene.add(debrisGroup)

  const PORTAL_R = 1.45
  const spotQ = new THREE.Quaternion().setFromUnitVectors(v(0, 0, 1), spotDir)
  // Sit the flat disc where it just touches the sphere at its rim.
  const lift = PR - Math.sqrt(PR * PR - PORTAL_R * PORTAL_R)
  const spotP = PC.clone().addScaledVector(spotDir, PR - lift + 0.02)
  const portal = createPortal({ shape: 'circle', radius: PORTAL_R, smoke: 0.72, tint: '#fffaf0', rim: 0.25, rimColor: '#ffffff', sheen: 0 })
  portal.mesh.position.copy(spotP)
  portal.mesh.quaternion.copy(spotQ)
  scene.add(portal.mesh)
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(PORTAL_R * 5, PORTAL_R * 5),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,250,236,0.6)', 'rgba(255,250,236,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  )
  glow.position.copy(spotP).addScaledVector(spotDir, 0.05)
  glow.quaternion.copy(spotQ)
  scene.add(glow)

  let rot = 0
  let tilt = 0
  return {
    name: 'final-transmission',
    scene,
    near: 0.05,
    far: 1500,
    portal,
    target: SCREEN.clone(),
    embed: embed(spotP, PORTAL_R / 12, spotQ),
    dark: true,
    tick(t, ctx) {
      const px = ctx.active ? ctx.pointer.x : 0
      const py = ctx.active ? ctx.pointer.y : 0
      rot += (px * 1.4 - rot) * Math.min(1, ctx.rawDt * 3)
      tilt += (-py * 0.5 - tilt) * Math.min(1, ctx.rawDt * 3)
      planetMat.uniforms.uRot.value = t * 0.03 + rot
      planetMat.uniforms.uTilt.value = tilt
      planetMat.uniforms.uTime.value = t
      debrisPts.rotation.y = t * 0.05 + rot * 0.5
      glow.material.opacity = 0.85 + Math.sin(t * 1.6) * 0.15
    },
  }
}

/* ------------------------------------------------------------------ */
/* World 4: Still Pavilion                                              */
/* ------------------------------------------------------------------ */

function buildPavilion(renderer) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#e7e1d5')
  scene.add(new THREE.HemisphereLight('#fbf6ec', '#b9ad97', 1.6))
  const sun = new THREE.DirectionalLight('#fff3df', 2.4)
  const C = v(7, -8, -58)
  sun.position.set(C.x - 22, 26, C.z + 18)
  sun.target.position.copy(C)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 })
  sun.shadow.bias = -0.0005
  scene.add(sun, sun.target)

  let tod = 0.3
  const state = { tod }
  const MORNING = { sun: new THREE.Color('#ffdcae'), sky: new THREE.Color('#e9e2d4') }
  const NOON = { sun: new THREE.Color('#fffaf0'), sky: new THREE.Color('#eeebe4') }
  const DUSK = { sun: new THREE.Color('#ff8f5a'), sky: new THREE.Color('#d8bfa6') }

  const stone = new THREE.MeshStandardMaterial({ color: '#d9cfbd', roughness: 0.92 })
  const pale = new THREE.MeshStandardMaterial({ color: '#e9e2d3', roughness: 0.9 })
  const wood = new THREE.MeshStandardMaterial({ color: '#7b6a52', roughness: 0.8 })
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.castShadow = true
    m.receiveShadow = true
    scene.add(m)
    return m
  }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: '#ddd5c5', roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = C.y - 1.2
  ground.receiveShadow = true
  scene.add(ground)

  add(new THREE.BoxGeometry(28, 1.2, 21), stone, C.x, C.y - 0.6, C.z)
  for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(7, 0.4, 1.1), stone, C.x - 6, C.y - 1 + i * 0.4, C.z + 11.6 - i * 0.9)
  add(new THREE.BoxGeometry(24, 0.04, 17), pale, C.x, C.y + 0.02, C.z)

  // Floor joints.
  const joints = []
  for (let x = -12; x <= 12; x += 3) joints.push(C.x + x, C.y + 0.05, C.z - 8.5, C.x + x, C.y + 0.05, C.z + 8.5)
  for (let z = -8.5; z <= 8.5; z += 3.4) joints.push(C.x - 12, C.y + 0.05, C.z + z, C.x + 12, C.y + 0.05, C.z + z)
  const jg = new THREE.BufferGeometry()
  jg.setAttribute('position', new THREE.Float32BufferAttribute(joints, 3))
  scene.add(new THREE.LineSegments(jg, new THREE.LineBasicMaterial({ color: '#c4b8a2' })))

  for (const [x, z] of [[-10.5, 7], [10.5, 7], [-10.5, -7], [10.5, -7], [3.5, 7]]) {
    add(new THREE.BoxGeometry(0.8, 8, 0.8), stone, C.x + x, C.y + 4, C.z + z)
  }

  // Roof slab with an oculus.
  const roofShape = roundedRectShape(24, 17, 0.1)
  const hole = new THREE.Path()
  hole.absellipse(0, 0, 3.6, 3.6, 0, Math.PI * 2, true, 0)
  roofShape.holes.push(hole)
  const roof = add(new THREE.ExtrudeGeometry(roofShape, { depth: 0.9, bevelEnabled: false, curveSegments: 48 }), pale, C.x, C.y + 8, C.z)
  roof.rotation.x = -Math.PI / 2

  // Slatted wall on the left and a back wall with the site capture.
  for (let i = 0; i < 14; i++) add(new THREE.BoxGeometry(0.22, 7.6, 0.5), wood, C.x - 10.5, C.y + 3.8, C.z - 6.2 + i * 0.95)
  add(new THREE.BoxGeometry(13, 7.4, 0.5), stone, C.x + 3, C.y + 3.7, C.z - 7.4)
  const print = new THREE.Mesh(
    new THREE.PlaneGeometry(8.8, 5.5),
    new THREE.MeshBasicMaterial({ map: imageTexture('/media/still-pavilion.webp', renderer) }),
  )
  print.position.set(C.x + 3, C.y + 4, C.z - 7.13)
  scene.add(print)

  // Plinth and sculpture.
  add(new THREE.CylinderGeometry(2.6, 2.6, 0.3, 64), pale, C.x - 1, C.y + 0.15, C.z + 1)
  const sculpture = add(
    new THREE.TorusKnotGeometry(1.5, 0.42, 220, 28, 2, 3),
    new THREE.MeshStandardMaterial({ color: '#d3c6aa', roughness: 0.5, metalness: 0.1 }),
    C.x - 1,
    C.y + 3.4,
    C.z + 1,
  )

  return {
    name: 'still-pavilion',
    scene,
    near: 0.05,
    far: 900,
    portal: null,
    target: v(C.x, C.y + 4, C.z),
    embed: null,
    dark: false,
    shadows: true,
    state,
    tick(t, ctx) {
      sculpture.rotation.y = t * 0.08
      const goal = ctx.active ? (ctx.pointer.x + 1) / 2 : 0.3
      tod += (goal - tod) * Math.min(1, ctx.dt * 3)
      const arc = THREE.MathUtils.lerp(-1.25, 1.25, tod)
      sun.position.set(C.x + Math.sin(arc) * 34, C.y + 6 + Math.cos(arc) * 26, C.z + 16)
      sun.color.copy(MORNING.sun).lerp(NOON.sun, Math.min(1, tod * 2)).lerp(DUSK.sun, Math.max(0, tod * 2 - 1))
      sun.intensity = THREE.MathUtils.lerp(2.3, 3.0, 1 - Math.abs(tod - 0.5) * 2) - Math.max(0, tod - 0.6) * 1.4
      scene.background.copy(MORNING.sky).lerp(NOON.sky, Math.min(1, tod * 2)).lerp(DUSK.sky, Math.max(0, tod * 2 - 1))
      state.tod = tod
    },
  }
}

export async function buildWorlds(renderer) {
  const env = envFor(renderer)
  return [
    buildInstrument(env),
    buildSyncDocs(renderer),
    buildClipboard(renderer, env),
    buildFinalTransmission(renderer),
    buildPavilion(renderer),
  ]
}
