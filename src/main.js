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

// Phones and small windows: a "desktop required" page.
if (root.classList.contains('phone')) {
  // A window that is merely too small switches to the journey once it is big enough.
  const mq = window.matchMedia('(min-width: 960px) and (min-height: 500px)')
  mq.addEventListener('change', (e) => e.matches && location.reload())
  const share = document.querySelector('.desk__share')
  const note = document.querySelector('.desk__copied')
  const url = location.origin + location.pathname
  if (navigator.share) share.textContent = 'Share this link'
  else share.textContent = 'Copy this link'
  share.addEventListener('click', async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Shivansh Pratap Singh: portfolio', url })
        return
      }
      await navigator.clipboard.writeText(url)
      note.textContent = 'Link copied. Open it on a desktop.'
    } catch (e) {
      if (e?.name !== 'AbortError') note.textContent = url
    }
  })
}

// Hardware acceleration notice: a software renderer, no WebGL, or a slow first few seconds.
const gpuNote = document.querySelector('.gpu-note')
function dismissed() {
  try {
    return sessionStorage.getItem('gpu-note') === 'off'
  } catch (e) {
    return false
  }
}
function showGpuNote(reason) {
  if (dismissed() || root.classList.contains('phone')) return
  const why = gpuNote.querySelector('.gpu-note__why')
  if (reason === 'none') why.textContent = 'Your browser cannot draw 3D right now, so this is the simple version.'
  else if (reason === 'slow') why.textContent = 'The 3D is running slowly; turning it on usually fixes that.'
  else why.textContent = 'The 3D will stutter without it.'
  gpuNote.hidden = false
}
const isEdge = /Edg\//.test(navigator.userAgent)
const addr = isEdge ? 'edge://settings/system' : 'chrome://settings/system'
gpuNote.querySelector('.gpu-note__addr').textContent = addr
const more = gpuNote.querySelector('.gpu-note__more')
more.addEventListener('click', () => {
  const open = more.getAttribute('aria-expanded') !== 'true'
  more.setAttribute('aria-expanded', String(open))
  gpuNote.querySelector('.gpu-note__steps').hidden = !open
})
gpuNote.querySelector('.gpu-note__copy').addEventListener('click', async (e) => {
  try {
    await navigator.clipboard.writeText(addr)
    e.target.textContent = 'Copied'
  } catch (err) {
    e.target.textContent = 'Copy failed'
  }
})
gpuNote.querySelector('.gpu-note__close').addEventListener('click', () => {
  gpuNote.hidden = true
  try {
    sessionStorage.setItem('gpu-note', 'off')
  } catch (e) {}
})
if (root.dataset.gpu) showGpuNote(root.dataset.gpu)
document.addEventListener('journey:slow', () => showGpuNote('slow'))

if (root.classList.contains('journey')) {
  import('./journey/index.js')
    .then((m) => m.start())
    .catch((err) => {
      // Anything going wrong in WebGL falls back to the readable layout.
      console.error(err)
      root.classList.replace('journey', 'linear')
    })
}
