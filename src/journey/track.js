import * as THREE from 'three'

/*
 * The camera path. Scroll gives a value g in [0, 9]: whole numbers are the
 * boundaries between segments, in DOM order:
 *
 *   0 hero dwell · 1 zoom into the static · 2 SyncDocs dwell · 3 into the copy glyph
 *   4 Clipboard dwell · 5 along the signal into the display · 6 Final Transmission dwell
 *   7 through the bright opening · 8 Still Pavilion dwell
 *
 * Every pose is a pure function of g, so stopping and scrolling back retraces
 * the same path.
 *
 * A transition from world k to k+1 is computed in world k+1's coordinates,
 * around the target object T that grows into the scene. The distance to T is
 * interpolated in log space (a constant zoom rate, which reads as falling)
 * and the direction from T turns from the start view to the reading view.
 */

const v = (x, y, z) => new THREE.Vector3(x, y, z)
const pose = (world, pos, look) => ({ world, pos, look })

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10)

function slerpUnit(a, b, t, out = new THREE.Vector3()) {
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1)
  const theta = Math.acos(dot) * t
  if (theta < 1e-5) return out.copy(a).lerp(b, t).normalize()
  const rel = b.clone().addScaledVector(a, -dot).normalize()
  return out.copy(a).multiplyScalar(Math.cos(theta)).addScaledVector(rel, Math.sin(theta))
}

// The embedding is a similarity: p_outer = P + s * Q * p_inner.
export function toInner(world, p) {
  const { P, s, Qi } = world.embed
  return p.clone().sub(P).applyQuaternion(Qi).divideScalar(s)
}
export function toOuter(world, p) {
  const { P, s, Q } = world.embed
  return p.clone().applyQuaternion(Q).multiplyScalar(s).add(P)
}

export function createTrack(worlds) {
  // Reading poses. Each project sits to the right so the text card on the
  // left never covers it.
  const H0 = pose(0, v(0.3, 0, 16.5), v(0.3, 0, 0))
  const H1 = pose(0, v(0.6, 0.05, 15.2), v(0.8, 0.03, 0))

  const S0 = pose(1, v(-4.4, -0.4, -16.5), v(-4.4, -0.4, -40))
  const S1 = pose(1, v(-3.6, 0.2, -18.8), v(-3.4, 0.2, -40))

  const C0 = pose(2, v(-4.6, 2.6, -6.5), v(-4.6, 0.6, -34))
  const C1 = pose(2, v(-3.6, 2.6, -10), v(-2.8, 0.8, -34))

  const F0 = pose(3, v(-4.8, 0.6, -9.5), v(-4.6, 1.5, -48))
  const F1 = pose(3, v(-4.6, 1.2, -12.5), v(-4.4, 2.2, -48))

  const P0 = pose(4, v(-4.5, 3.6, -13.5), v(-3.0, -3.4, -58))
  const Pmid = pose(4, v(-1.5, 2.6, -17.5), v(-1.6, -3.6, -58))
  const P1 = pose(4, v(2.5, 1.6, -21.5), v(-0.4, -3.8, -58))

  const segments = [
    { kind: 'dwell', a: H0, b: H1 },
    { kind: 'transit', from: 0, a: H1, b: S0 },
    { kind: 'dwell', a: S0, b: S1 },
    { kind: 'transit', from: 1, a: S1, b: C0 },
    { kind: 'dwell', a: C0, b: C1 },
    { kind: 'transit', from: 2, a: C1, b: F0 },
    { kind: 'dwell', a: F0, b: F1 },
    { kind: 'transit', from: 3, a: F1, b: P0 },
    { kind: 'dwell', a: P0, b: P1, via: Pmid },
  ]

  // Precompute transition geometry in the inner world's coordinates.
  for (const seg of segments) {
    if (seg.kind !== 'transit') continue
    const outer = worlds[seg.from]
    const inner = worlds[seg.from + 1]
    const T = inner.target
    const A = toInner(outer, seg.a.pos)
    const Alook = toInner(outer, seg.a.look)
    const vA = A.clone().sub(T)
    const vB = seg.b.pos.clone().sub(T)
    seg.geo = {
      T,
      dA: vA.length(),
      dB: vB.length(),
      uA: vA.normalize(),
      uB: vB.normalize(),
      dirA: Alook.sub(A).normalize(),
      dirB: seg.b.look.clone().sub(seg.b.pos).normalize(),
    }
  }

  const out = { world: 0, pos: new THREE.Vector3(), dir: new THREE.Vector3(), focus: 1 }

  function evaluate(g) {
    const i = Math.min(segments.length - 1, Math.max(0, Math.floor(g)))
    const t = Math.min(1, Math.max(0, g - i))
    const seg = segments[i]

    if (seg.kind === 'dwell') {
      const e = t
      let pos, look
      if (seg.via) {
        // Quadratic Bezier through the via point for a gentle arc.
        const q = (a, m, b) => a.clone().multiplyScalar((1 - e) ** 2).addScaledVector(m, 2 * (1 - e) * e).addScaledVector(b, e * e)
        const mPos = seg.via.pos.clone().multiplyScalar(2).addScaledVector(seg.a.pos.clone().add(seg.b.pos), -0.5)
        const mLook = seg.via.look.clone().multiplyScalar(2).addScaledVector(seg.a.look.clone().add(seg.b.look), -0.5)
        pos = q(seg.a.pos, mPos, seg.b.pos)
        look = q(seg.a.look, mLook, seg.b.look)
      } else {
        pos = seg.a.pos.clone().lerp(seg.b.pos, e)
        look = seg.a.look.clone().lerp(seg.b.look, e)
      }
      out.world = seg.a.world
      out.pos.copy(pos)
      out.dir.copy(look).sub(pos)
      out.focus = out.dir.length()
      out.dir.normalize()
      out.transit = null
      return out
    }

    const { T, dA, dB, uA, uB, dirA, dirB } = seg.geo
    // e drives turning; the distance uses a steeper curve so the outer
    // object stays in view longer, the fall through it is quick, and the
    // arrival is slow.
    const e = smoother(t)
    const d = Math.exp(THREE.MathUtils.lerp(Math.log(dA), Math.log(dB), smoother(e)))
    const u = slerpUnit(uA, uB, smooth(0, 0.72, e))
    out.world = seg.from + 1
    out.pos.copy(T).addScaledVector(u, d)

    // Turn toward the target early, then settle into the reading direction.
    const toT = T.clone().sub(out.pos).normalize()
    const early = slerpUnit(dirA, toT, smooth(0, 0.32, e))
    slerpUnit(early, dirB, smooth(0.74, 1, e), out.dir)
    out.focus = d
    out.e = e
    out.transit = seg
    return out
  }

  return { evaluate, segments, count: segments.length }
}
