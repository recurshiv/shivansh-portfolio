import * as THREE from 'three'

// A portal is a flat aperture (circle or rounded rectangle) that shows the
// next world. The next world is rendered into a texture from a camera whose
// projection matches the main camera, so the aperture can sample that texture
// with plain screen coordinates. The shader adds the glass: smoke, a cobalt
// rim, a sheen that moves with the viewing angle, and a pointer lens that
// clears the smoke, magnifies and splits colour along its edges.

// TV static shared by the CRT screen and its bright-patch portal, so the two
// match exactly where they meet. q is a point on the screen in TV units.
export const STATIC_GLSL = /* glsl */ `
  float tvHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float tvStatic(vec2 q, float t) {
    float frame = mod(floor(t * 24.0), 61.0);
    float n = tvHash(floor(q * 64.0) + frame * vec2(17.13, 31.71));
    float line = tvHash(vec2(floor(q.y * 64.0), frame * 3.1));
    return mix(n, line, 0.3);
  }
  // Scanlines, a slow rolling bar and the darkened corners of the tube.
  // How far the grain is magnified: 0 at normal size, 1 once a grain cell
  // spans many pixels. Close up, the grain and scanlines smooth out.
  float tvZoom(vec2 q) {
    float cellPx = (1.0 / 64.0) / max(fwidth(q.x), 1e-6);
    return smoothstep(3.0, 16.0, cellPx);
  }
  float tvShade(vec2 q, float t, vec2 halfSize, float zoom) {
    vec2 e = abs(q) / halfSize;
    float d = pow(pow(e.x, 4.0) + pow(e.y, 4.0), 0.25);
    float vig = 1.0 - 0.6 * smoothstep(0.55, 1.05, d);
    float roll = 0.92 + 0.08 * smoothstep(0.6, 1.0, sin(q.y * 1.7 - t * 1.6));
    return (0.84 + 0.16 * mix(sin(q.y * 220.0), 1.0, zoom)) * roll * vig;
  }
  vec3 tvGlintColor() {
    return vec3(1.0, 0.99, 0.965);
  }
  // A reflection on the curved glass: a round hot core of radius r (the portal),
  // a halo stretched along the corner diagonal, and two thin light streaks.
  float tvGlint(vec2 d, float r, float t) {
    vec2 a = vec2(d.x + d.y, d.y - d.x) * 0.70710678;
    float dl = length(d);
    float core = 1.0 - smoothstep(r * 0.97, r, dl);
    float el = length(vec2(a.x / 1.7, a.y));
    float halo = exp(-pow(max(el - r * 0.9, 0.0) / (r * 0.55), 2.0)) * 0.85
               + exp(-max(el - r, 0.0) / (r * 2.2)) * 0.18;
    float tw = 0.85 + 0.15 * sin(t * 2.3) * sin(t * 1.7 + 1.0);
    float streak = exp(-abs(a.y) * 90.0 / (1.0 + abs(a.x) * 4.0)) * exp(-abs(a.x) / (r * 3.2)) * 0.9
                 + exp(-abs(a.x) * 110.0) * exp(-abs(a.y) / (r * 1.4)) * 0.45;
    return clamp(max(core, (halo + streak) * tw), 0.0, 1.0);
  }
`

const vertexShader = /* glsl */ `
  uniform vec2 uHalf;
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy / uHalf;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  ${STATIC_GLSL}
  uniform sampler2D tScene;
  uniform float uHasScene;
  uniform vec2 uRes;
  uniform vec2 uPointer;
  uniform float uPointerR;
  uniform float uHover;
  uniform float uShape;
  uniform float uSmoke;
  uniform vec3 uTint;
  uniform float uRim;
  uniform vec3 uRimColor;
  uniform float uSheen;
  uniform vec2 uGlint;
  uniform float uFade;
  uniform float uTime;
  uniform float uStatic;
  uniform vec2 uSpot;
  uniform float uSpotR;
  uniform vec2 uScreenHalf;
  uniform float uPower;
  varying vec2 vLocal;

  void main() {
    vec2 L = vLocal;
    // 0 at the centre of the aperture, 1 at its edge.
    float e = uShape < 0.5 ? length(L) : max(abs(L.x), abs(L.y));
    vec2 n = uShape < 0.5
      ? L / max(length(L), 1e-4)
      : (abs(L.x) > abs(L.y) ? vec2(sign(L.x), 0.0) : vec2(0.0, sign(L.y)));
    float rim = smoothstep(0.8, 1.0, e) * uFade;

    // Pointer lens, measured in screen pixels so it stays round.
    vec2 fromPointer = gl_FragCoord.xy - uPointer;
    float pr = length(fromPointer) / uPointerR;
    float lens = uHover * uFade * exp(-pr * pr * 1.4);

    vec2 suv = gl_FragCoord.xy / uRes;
    vec2 disp = -n * rim * rim * 0.022 * uRim;
    disp -= fromPointer / uRes * lens * 0.5;
    disp += vec2(sin(L.y * 11.0 + uTime * 0.7), cos(L.x * 9.0 - uTime * 0.6)) * 0.0016 * lens;

    float split = rim * rim * 0.007 * uRim + lens * 0.022 * smoothstep(0.0, 1.0, pr);
    vec2 sdir = normalize(disp + vec2(1e-5));

    vec3 col = uTint;
    if (uHasScene > 0.5) {
      col.r = texture2D(tScene, suv + disp + sdir * split).r;
      col.g = texture2D(tScene, suv + disp).g;
      col.b = texture2D(tScene, suv + disp - sdir * split).b;
    }

    float smoke = uSmoke * uFade * (1.0 - lens);
    col = mix(col, uTint, smoke);
    col *= 1.0 - 0.3 * smoothstep(0.45, 1.0, e) * uFade * uRim;
    col = mix(col, uRimColor, smoothstep(0.93, 1.0, e) * 0.35 * uRim * uFade);

    // The CRT's glint: a small bright reflection on the glass, the same white
    // as the screen draws around it, so its edge disappears until the camera is close.
    if (uStatic > 0.5) {
      float amt = uFade * (1.0 - lens) * mix(0.8, 1.0, smoothstep(0.3, 1.0, e));
      col = mix(col, tvGlintColor(), amt);
      col = mix(vec3(0.018, 0.02, 0.024), col, uPower);
    }

    // Sheen bands slide across the glass as the viewing angle changes.
    float g = dot(L, normalize(vec2(-0.8, 1.0))) + uGlint.x * 0.45 - uGlint.y * 0.3;
    float sheen = smoothstep(0.2, 0.0, abs(g - 0.42)) * 0.16 + smoothstep(0.045, 0.0, abs(g - 0.66)) * 0.13;
    col += sheen * uSheen * uFade;

    // A faint ring marks the lens edge.
    col += vec3(0.9, 0.92, 1.0) * smoothstep(0.035, 0.0, abs(pr - 1.05)) * uHover * uFade * 0.35;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

/**
 * @param {{shape:'circle'|'rect', radius?:number, width?:number, height?:number, corner?:number,
 *          smoke?:number, tint?:string, rim?:number, rimColor?:string, sheen?:number, static?:boolean}} o
 */
export function createPortal(o) {
  const circle = o.shape === 'circle'
  const geometry = circle
    ? new THREE.CircleGeometry(o.radius, 160)
    : new THREE.ShapeGeometry(roundedRectShape(o.width, o.height, o.corner ?? 0), 12)
  const half = circle ? new THREE.Vector2(o.radius, o.radius) : new THREE.Vector2(o.width / 2, o.height / 2)

  const uniforms = {
    tScene: { value: null },
    uHasScene: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uPointer: { value: new THREE.Vector2(-1e4, -1e4) },
    uPointerR: { value: 140 },
    uHover: { value: 0 },
    uShape: { value: circle ? 0 : 1 },
    uHalf: { value: half },
    uSmoke: { value: o.smoke ?? 0.2 },
    uTint: { value: new THREE.Color(o.tint ?? '#1b1f2b') },
    uRim: { value: o.rim ?? 1 },
    uRimColor: { value: new THREE.Color(o.rimColor ?? '#2340d6') },
    uSheen: { value: o.sheen ?? 1 },
    uGlint: { value: new THREE.Vector2() },
    uFade: { value: 1 },
    uTime: { value: 0 },
    uStatic: { value: o.static ? 1 : 0 },
    uSpot: { value: new THREE.Vector2() },
    uSpotR: { value: 1 },
    uScreenHalf: { value: new THREE.Vector2(1, 1) },
    uPower: { value: 1 },
  }
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader })
  const mesh = new THREE.Mesh(geometry, material)
  return {
    mesh,
    uniforms,
    // Size of the aperture in its own world's units; used for hover and fade.
    extent: Math.max(half.x, half.y),
    half,
  }
}
