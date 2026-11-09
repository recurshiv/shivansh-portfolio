// Shared page behaviour. The 3D journey loads only in journey mode, so phones,
// reduced-motion visitors and browsers without WebGL never download Three.js.

const root = document.documentElement

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

if (root.classList.contains('journey')) {
  import('./journey/index.js')
    .then((m) => m.start())
    .catch((err) => {
      // Anything going wrong in WebGL falls back to the readable layout.
      console.error(err)
      root.classList.replace('journey', 'linear')
    })
}
