// Shared page behaviour. The 3D journey loads only in journey mode, so phones,
// reduced-motion visitors and browsers without WebGL never download Three.js.

const root = document.documentElement

// Split the name into letters for the reveal. The h1 keeps an aria-label.
let index = 0
for (const line of document.querySelectorAll('.hero__line')) {
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        // Letters sit inside a no-wrap word so a line can only break between words.
        const frag = document.createDocumentFragment()
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue
          if (/^\s+$/.test(part)) {
            frag.append(part)
            continue
          }
          const word = document.createElement('span')
          word.className = 'word'
          for (const ch of part) {
            const span = document.createElement('span')
            span.className = 'char'
            span.style.setProperty('--i', index++)
            span.textContent = ch
            word.append(span)
          }
          frag.append(word)
        }
        child.replaceWith(frag)
      } else walk(child)
    }
  }
  walk(line)
}

// "View all work" panel.
const toggle = document.querySelector('.allwork__toggle')
const panel = document.getElementById('allwork-panel')

function setPanel(open) {
  toggle.setAttribute('aria-expanded', String(open))
  panel.hidden = !open
}
toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true'
  setPanel(open)
  if (open) panel.querySelector('a')?.focus()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !panel.hidden) {
    setPanel(false)
    toggle.focus()
  }
})
document.addEventListener('click', (e) => {
  if (!panel.hidden && !e.target.closest('.allwork')) setPanel(false)
})
panel.addEventListener('click', (e) => {
  if (e.target.closest('a')) setPanel(false)
})

// Simple layout on a capable desktop: offer the 3D journey.
document.querySelector('.journey-offer__btn')?.addEventListener('click', () => {
  try {
    localStorage.setItem('journey', 'on')
  } catch (e) {}
  const url = new URL(location.href)
  url.searchParams.set('mode', 'journey')
  location.replace(url)
})
// A window that was too narrow switches to the journey once it is wide enough.
if (root.dataset.why === 'narrow') {
  const mq = window.matchMedia('(min-width: 960px) and (min-height: 560px)')
  mq.addEventListener('change', (e) => e.matches && location.reload())
}

if (root.classList.contains('journey')) {
  import('./journey/index.js')
    .then((m) => m.start())
    .catch((err) => {
      // Anything going wrong in WebGL falls back to the readable layout.
      console.error(err)
      root.classList.replace('journey', 'linear')
    })
}
