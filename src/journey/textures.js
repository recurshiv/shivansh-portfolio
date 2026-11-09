import * as THREE from 'three'

const loader = new THREE.TextureLoader()

export function imageTexture(url, renderer) {
  const t = loader.load(url)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = renderer.capabilities.getMaxAnisotropy()
  return t
}

export function canvasTexture(w, h, draw, renderer) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  draw(ctx, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (renderer) t.anisotropy = renderer.capabilities.getMaxAnisotropy()
  return t
}

// Soft round blob, used for shadows and glows.
export function radialTexture(inner = 'rgba(0,0,0,0.5)', outer = 'rgba(0,0,0,0)') {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, inner)
    g.addColorStop(1, outer)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export function savedPillTexture(renderer) {
  return canvasTexture(
    600,
    125,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      roundRect(ctx, 4, 4, w - 8, h - 8, (h - 8) / 2)
      ctx.fillStyle = '#e8f8ee'
      ctx.fill()
      ctx.strokeStyle = '#1b8a4c'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(62, 52)
      ctx.lineTo(78, 68)
      ctx.lineTo(108, 36)
      ctx.stroke()
      ctx.fillStyle = '#16703e'
      ctx.font = '600 44px Inter, system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillText('Saved', 130, 53)
    },
    renderer,
  )
}

// Faint document lines for the stacked pages behind the main document.
export function ghostPageTexture(seed, renderer) {
  return canvasTexture(
    512,
    452,
    (ctx, w, h) => {
      ctx.fillStyle = '#fbfbfa'
      ctx.fillRect(0, 0, w, h)
      let r = seed
      const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280)
      ctx.fillStyle = '#1d1d22'
      ctx.globalAlpha = 0.75
      ctx.fillRect(50, 60, 180 + rand() * 140, 22)
      ctx.globalAlpha = 0.22
      let y = 112
      while (y < h - 50) {
        ctx.fillRect(50, y, 260 + rand() * 150, 10)
        y += rand() > 0.8 ? 42 : 24
      }
    },
    renderer,
  )
}

// Illustrative clipboard app screen (the real app has no published screenshots).
export function deviceScreenTexture(role, renderer) {
  return canvasTexture(
    1000,
    620,
    (ctx, w, h) => {
      ctx.fillStyle = '#0f1426'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#161d36'
      ctx.fillRect(0, 0, w, 74)
      ctx.fillStyle = '#e7eaf6'
      ctx.font = '600 30px Inter, system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillText('Universal Clipboard', 36, 38)
      ctx.fillStyle = '#5bd38a'
      ctx.beginPath()
      ctx.arc(w - 214, 38, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#a9b3d6'
      ctx.font = '500 24px "JetBrains Mono", monospace'
      ctx.fillText(role === 'a' ? 'paired · desk-b' : 'paired · desk-a', w - 196, 38)

      ctx.fillStyle = '#8f9bc7'
      ctx.font = '500 20px "JetBrains Mono", monospace'
      ctx.fillText(role === 'a' ? 'COPIED HERE' : 'RECEIVED', 36, 120)
      roundRect(ctx, 36, 142, w - 72, 150, 16)
      ctx.fillStyle = '#1b2447'
      ctx.fill()
      ctx.strokeStyle = '#3d57e6'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = '#f2f4fb'
      ctx.font = '500 34px Inter, system-ui, sans-serif'
      ctx.fillText('“Lab at 4 pm, room 204”', 66, 196)
      ctx.fillStyle = '#8f9bc7'
      ctx.font = '400 22px "JetBrains Mono", monospace'
      ctx.fillText('text · 23 bytes · just now', 66, 248)

      ctx.fillStyle = '#8f9bc7'
      ctx.font = '500 20px "JetBrains Mono", monospace'
      ctx.fillText('HISTORY', 36, 344)
      const rows = [
        ['image', 'diagram.png · 412 KB'],
        ['text', 'git clone https://github.com/…'],
        ['text', 'Meeting notes, week 6'],
      ]
      rows.forEach(([kind, label], i) => {
        const y = 370 + i * 76
        roundRect(ctx, 36, y, w - 72, 62, 12)
        ctx.fillStyle = '#141b33'
        ctx.fill()
        ctx.fillStyle = kind === 'image' ? '#e0a34a' : '#5e72e4'
        ctx.fillRect(56, y + 18, 26, 26)
        ctx.fillStyle = '#d5daec'
        ctx.font = '400 26px Inter, system-ui, sans-serif'
        ctx.fillText(label, 104, y + 32)
      })
    },
    renderer,
  )
}

export function hudLabelTexture(text, color, renderer) {
  return canvasTexture(
    1024,
    64,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = color
      ctx.font = '500 30px "JetBrains Mono", monospace'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 4, h / 2)
    },
    renderer,
  )
}
