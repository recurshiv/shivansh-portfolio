# Shivansh Pratap Singh: portfolio

A single-page portfolio built as one continuous, reversible camera move. On desktop, scrolling falls through the glass of an optical instrument into SyncDocs. From there it goes through the copy glyph into Universal Clipboard Sync, along the signal into Final Transmission, and through a bright opening into Still Pavilion. The page ends with a quiet About section.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serves dist/ on http://localhost:4173
```

The build output is a plain static site, so it can be hosted anywhere.

## How the journey works

- **Nested worlds joined by portals** (`src/journey/worlds.js`). Each world contains the next one at a position, rotation and scale. The bridge object (the glass, the copy glyph, the receiver display, the bright opening) is a portal. The next world is rendered into a texture by a camera mapped through that embedding, and the portal samples it in screen space. The real next scene is therefore visible inside the bridge object from the start.
- **Seamless crossing** (`src/journey/index.js`). When the camera reaches the portal plane, the portal fills the whole view, and rendering switches to the inner world at the equivalent pose. There is no cut, and no scene jump.
- **Camera path** (`src/journey/track.js`). Scroll maps to a value `g` from 0 to 9: hero, four transitions, four reading dwells. In a transition, the distance to the target object is interpolated in log space, which keeps a constant zoom rate and reads as falling. Each pose is a pure function of `g`, so scrolling back retraces the path exactly.
- **Glass shader** (`src/journey/portal.js`). It adds smoke, a cobalt rim with edge refraction, and a sheen that follows the viewing angle. A pointer lens clears the smoke, magnifies, and splits colour, and the effect is confined to the aperture.
- **Pointer look-around.** The camera orbits its focus point slightly, and the orbit is stronger on the hero. It eases back to centre when the pointer leaves. Scroll alone decides progress.
- **Iris diaphragm.** Nine blades are drawn in the glass shader. They open on load, dilate under the pointer to reveal the lens, and open fully as the camera dives in.
- **Scene interactions** (the cursor labels each one):
  - SyncDocs: click to type a line and watch the autosave states (Unsaved changes, then Saving…, then Saved).
  - Clipboard Sync: click to send a burst along the signal.
  - Final Transmission: the planet follows the pointer.
  - Still Pavilion: the pointer sets the time of day, from morning to dusk.
- **Readout.** A live readout shows the scene, the magnification relative to the hero, and the depth.
- **Text is HTML.** Titles, descriptions and links are semantic HTML laid over the canvas, and never part of the 3D scene.

## Layouts

`index.html` picks the layout before first paint:

- **Journey:** a viewport at least 960 × 560, motion allowed, and WebGL available.
- **Linear:** everything else, meaning phones, `prefers-reduced-motion`, or no WebGL. It is a readable column with real captures, and Three.js is never downloaded.
- `?mode=linear` forces the linear layout.

**View all work** in the header links straight to all four live projects, and to each scene.

## Content sources

- **SyncDocs** captures were taken from the live app (https://syncdocs-lut9.onrender.com/) with a throwaway account.
- **Final Transmission** and **Still Pavilion** captures were taken from their live sites.
- **Universal Clipboard Sync** has no published screenshots. The device screens in its scene are an illustration, and the card says so.
- **Claims** follow the projects' own READMEs. SyncDocs does not yet do real-time co-editing. Clipboard Sync's two-machine hardware testing is still to do.

## Checks

`tests/journey-check.mjs` drives headless Chromium with software WebGL against `npm run preview`. It checks:

- the look-around and the glass refraction, with the text unchanged;
- easing back to centre;
- reversal at four points, comparing pose and image;
- keyboard reach of every project link;
- the View all work panel and its shortcut jumps;
- mobile, reduced-motion and no-WebGL layouts, including no horizontal scroll.

```bash
cd tests && npm install && npx playwright install chromium
node journey-check.mjs ./shots
```
