import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createPortal, roundedRectShape } from './portal.js'
import {
  imageTexture,
  radialTexture,
  savedPillTexture,
  ghostPageTexture,
  deviceScreenTexture,
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

  // Knurled focus ring.
  const focus = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.9, 160, 1, true).rotateX(Math.PI / 2), rubber)
  focus.position.z = -0.78
  inst.add(focus)
  inst.add(
    ringInstances(180, new THREE.BoxGeometry(0.045, 0.07, 0.86), rubber, (m, i) => {
      const a = (i / 180) * Math.PI * 2
      m.position.set(Math.cos(a) * 3.22, Math.sin(a) * 3.22, -0.78)
      m.rotation.set(0, 0, a)
    }),
  )
  const step = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.21, 160), bright)
  step.position.z = -0.3
  inst.add(step)

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

  const portal = createPortal({ shape: 'circle', radius: R, smoke: 0.44, tint: '#1a1e2a', rim: 1, sheen: 1 })
  inst.add(portal.mesh)

  return {
    name: 'instrument',
    scene,
    near: 0.03,
    far: 220,
    portal,
    embed: embed(G, 0.1, inst.quaternion),
    dark: false,
    tick() {},
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

  const pill = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.5),
    new THREE.MeshBasicMaterial({ map: savedPillTexture(renderer), transparent: true }),
  )
  pill.position.set(3.95, H / 2 + 0.55, PAGE_Z)
  scene.add(pill)

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
    tick(t) {
      const k = (t * 0.5) % 1
      hint.scale.setScalar(1 + k * 0.7)
      hint.material.opacity = 0.55 * (1 - k)
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
    vec3 col = mix(uColor * 0.55, vec3(0.92, 0.95, 1.0), dash);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

function buildClipboard(renderer, env) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#0b0f1f')
  scene.environment = env
  scene.environmentIntensity = 0.35
  scene.add(new THREE.AmbientLight('#8fa2ff', 0.5))
  const key = new THREE.DirectionalLight('#dfe5ff', 1.4)
  key.position.set(-6, 10, 8)
  scene.add(key)

  const Z = -34
  const grid = new THREE.GridHelper(600, 150, '#25336f', '#18214a')
  grid.position.y = -3.62
  scene.add(grid)

  const bezelMat = new THREE.MeshStandardMaterial({ color: '#1a1f33', metalness: 0.7, roughness: 0.35 })
  const device = (x, ry, role) => {
    const g = new THREE.Group()
    g.position.set(x, 0, Z)
    g.rotation.y = ry
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.5, 0.18), bezelMat)
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(5.1, 3.16),
      new THREE.MeshBasicMaterial({ map: deviceScreenTexture(role, renderer) }),
    )
    screen.position.z = 0.095
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.9, 0.2), bezelMat)
    neck.position.set(0, -2.6, -0.15)
    const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 1.2), bezelMat)
    base.position.set(0, -3.55, 0.1)
    g.add(body, screen, neck, base)
    scene.add(g)
    return g
  }
  device(-4.3, 0.28, 'a')
  device(4.3, -0.28, 'b')

  // Receiver: a mast with a display. The display is the next portal.
  const RX = v(15, 6.5, -74)
  const recv = new THREE.Group()
  recv.position.copy(RX)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 0.3), bezelMat)
  frame.position.z = -0.16
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 12, 24), bezelMat)
  mast.position.set(0, -7.2, -0.3)
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 3.2),
    new THREE.MeshStandardMaterial({ color: '#6f7894', metalness: 0.55, roughness: 0.5, side: THREE.DoubleSide }),
  )
  dish.rotation.x = -Math.PI / 2.6
  dish.position.set(0, 2.1, -0.4)
  recv.add(frame, mast, dish)
  scene.add(recv)

  const portal = createPortal({
    shape: 'rect',
    width: 3.2,
    height: 2.0,
    corner: 0.05,
    smoke: 0.08,
    tint: '#0a0d0a',
    rim: 0.7,
    rimColor: '#3d57e6',
    sheen: 0.45,
  })
  portal.mesh.position.set(RX.x, RX.y, RX.z + 0.002)
  scene.add(portal.mesh)

  // The signal: device A to device B, then on to the receiver.
  const signalMat = (length) =>
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLength: { value: length }, uColor: { value: new THREE.Color('#3d57e6') } },
      vertexShader: signalVertex,
      fragmentShader: signalFragment,
    })
  const curves = [
    new THREE.CatmullRomCurve3([v(-1.9, 1.75, Z + 0.5), v(-0.8, 3.4, Z), v(0.8, 3.4, Z), v(1.9, 1.75, Z + 0.5)]),
    new THREE.CatmullRomCurve3([v(6.6, 1.2, Z - 0.6), v(9.5, 3, Z - 10), v(12.5, 5, Z - 26), v(15, 5.2, RX.z - 0.2)]),
  ]
  const signals = curves.map((c) => {
    const m = new THREE.Mesh(new THREE.TubeGeometry(c, 160, 0.04, 8), signalMat(c.getLength()))
    scene.add(m)
    return m
  })
  const pulses = []
  const pulseMat = new THREE.MeshBasicMaterial({ color: '#e9edff' })
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), pulseMat)
    scene.add(p)
    pulses.push(p)
  }

  return {
    name: 'clipboard',
    scene,
    near: 0.05,
    far: 900,
    portal,
    target: v(0, 0, Z),
    embed: embed(portal.mesh.position, 3.2 / 32),
    dark: true,
    tick(t) {
      for (const s of signals) s.material.uniforms.uTime.value = t
      pulses.forEach((p, i) => {
        const u = (t * 0.16 + i / pulses.length) % 1
        // First 30% of the cycle crosses between the devices, the rest flies to the receiver.
        const pt = u < 0.3 ? curves[0].getPointAt(u / 0.3) : curves[1].getPointAt((u - 0.3) / 0.7)
        p.position.copy(pt)
      })
    },
  }
}

/* ------------------------------------------------------------------ */
/* World 3: Final Transmission                                          */
/* ------------------------------------------------------------------ */

function buildFinalTransmission(renderer) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#080b08')

  // Stars.
  const n = 2600
  const pos = new Float32Array(n * 3)
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rand() - 0.5) * 700
    pos[i * 3 + 1] = (rand() - 0.5) * 450
    pos[i * 3 + 2] = -60 - rand() * 600
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#cfd8bf', size: 1.1, sizeAttenuation: true })))

  // Planet sketch echoing the site.
  const planet = new THREE.Group()
  planet.position.set(-30, 12, -120)
  planet.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(10, 36, 24),
      new THREE.MeshBasicMaterial({ color: '#4f6b33', wireframe: true, transparent: true, opacity: 0.35 }),
    ),
  )
  const orbit = new THREE.Mesh(new THREE.TorusGeometry(15, 0.12, 8, 240), new THREE.MeshBasicMaterial({ color: '#ff6a3d' }))
  orbit.rotation.set(1.25, 0.2, 0.3)
  planet.add(orbit)
  scene.add(planet)

  // The site capture on a large display.
  const SCREEN = v(0, 0.6, -48)
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 10),
    new THREE.MeshBasicMaterial({ map: imageTexture('/media/final-transmission.webp', renderer) }),
  )
  screen.position.copy(SCREEN)
  scene.add(screen)
  const lime = new THREE.LineBasicMaterial({ color: '#d4f25c' })
  const corners = []
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = SCREEN.x + sx * 8.4
    const cy = SCREEN.y + sy * 5.4
    corners.push(cx, cy - sy * 1.1, SCREEN.z, cx, cy, SCREEN.z, cx, cy, SCREEN.z, cx - sx * 1.1, cy, SCREEN.z)
  }
  const cornerGeo = new THREE.BufferGeometry()
  cornerGeo.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3))
  scene.add(new THREE.LineSegments(cornerGeo, lime))

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 0.5625),
    new THREE.MeshBasicMaterial({ map: hudLabelTexture('SIGNAL 03 · FINAL TRANSMISSION · 3027', '#d4f25c', renderer), transparent: true }),
  )
  label.position.set(SCREEN.x - 3.5, SCREEN.y + 6.1, SCREEN.z)
  scene.add(label)

  const FLOOR_Y = -5.2
  const grid = new THREE.GridHelper(600, 120, '#1f2b17', '#151d10')
  grid.position.y = FLOOR_Y
  scene.add(grid)

  // The bright opening.
  const DOOR = v(11.2, FLOOR_Y + 2.2, -50)
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 12),
    new THREE.MeshBasicMaterial({
      map: radialTexture('rgba(255,244,222,0.55)', 'rgba(255,244,222,0)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  glow.position.set(DOOR.x, DOOR.y, DOOR.z - 0.05)
  scene.add(glow)
  const spill = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 16),
    new THREE.MeshBasicMaterial({
      map: radialTexture('rgba(255,240,214,0.35)', 'rgba(255,240,214,0)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  spill.rotation.x = -Math.PI / 2
  spill.position.set(DOOR.x, FLOOR_Y + 0.01, DOOR.z + 6)
  scene.add(spill)
  const jambMat = new THREE.MeshBasicMaterial({ color: '#fff4de' })
  for (const [w, h, x, y] of [
    [0.08, 4.5, -1.24, 0],
    [0.08, 4.5, 1.24, 0],
    [2.56, 0.08, 0, 2.24],
  ]) {
    const jamb = new THREE.Mesh(new THREE.PlaneGeometry(w, h), jambMat)
    jamb.position.set(DOOR.x + x, DOOR.y + y, DOOR.z + 0.001)
    scene.add(jamb)
  }

  const portal = createPortal({
    shape: 'rect',
    width: 2.4,
    height: 4.4,
    corner: 0,
    smoke: 0.1,
    tint: '#fff6e4',
    rim: 0.5,
    rimColor: '#ffe9c2',
    sheen: 0,
  })
  portal.mesh.position.set(DOOR.x, DOOR.y, DOOR.z + 0.002)
  scene.add(portal.mesh)

  return {
    name: 'final-transmission',
    scene,
    near: 0.05,
    far: 1500,
    portal,
    target: SCREEN.clone(),
    embed: embed(portal.mesh.position, 2.4 / 24),
    dark: true,
    tick(t) {
      planet.rotation.y = t * 0.04
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
    tick(t) {
      sculpture.rotation.y = t * 0.08
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
