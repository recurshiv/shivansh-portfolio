import * as THREE from 'three'

// A portal is a flat aperture (circle or rounded rectangle) that shows the
// next world. The next world is rendered into a texture from a camera whose
// projection matches the main camera, so the aperture can sample that texture
// with plain screen coordinates. The shader adds the glass: smoke, a cobalt
// rim, a sheen that moves with the viewing angle, and a pointer lens that
// clears the smoke, magnifies and splits colour along its edges.

const vertexShader = /* glsl */ `
  uniform vec2 uHalf;
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy / uHalf;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
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
  uniform float uIris;
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

    // Iris diaphragm: nine blades whose opening is a regular polygon.
    if (uIris > 0.001 && uShape < 0.5) {
      const float N = 9.0;
      const float SECTOR = 6.2831853 / N;
      float r = mix(1.03, 0.07, uIris);
      float rot = uIris * 1.7;
      float a = atan(L.y, L.x) - rot;
      float k = floor(a / SECTOR + 0.5);
      float phi = rot + k * SECTOR;
      float outside = dot(L, vec2(cos(phi), sin(phi))) - r;
      float blade = smoothstep(-0.003, 0.003, outside);
      // Seams curve outward from the polygon's corners, like overlapping blades.
      float tw = (a + (length(L) - r) * 1.9) / SECTOR;
      float s = fract(tw);
      float id = mod(floor(tw), 2.0);
      vec3 metal = mix(vec3(0.006, 0.007, 0.009), vec3(0.04, 0.043, 0.05), s) * (0.8 + 0.3 * id);
      metal += vec3(0.5, 0.52, 0.56) * smoothstep(0.025, 0.0, s) * 0.1;
      metal += vec3(0.75, 0.78, 0.85) * smoothstep(0.035, 0.0, outside) * blade * 0.55;
      metal *= 1.0 - 0.35 * smoothstep(0.6, 1.0, length(L));
      col = mix(col, metal, blade);
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
 *          smoke?:number, tint?:string, rim?:number, rimColor?:string, sheen?:number}} o
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
    uIris: { value: 0 },
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
