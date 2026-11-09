# Shivansh Pratap Singh: portfolio

A single-page portfolio built as one continuous, reversible camera move. On desktop, scrolling zooms into a glint of light on a vintage TV's glass and comes out on the SyncDocs page. From there it goes through the copy glyph into Universal Clipboard Sync, into the received image on the second laptop for Final Transmission, and through a lone transmitting beacon on the planet into Still Pavilion. The page ends with a quiet About section.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serves dist/ on http://localhost:4173
```

The build output is a plain static site, so it can be hosted anywhere.

## How the journey works

- **Nested worlds joined by portals** (`src/journey/worlds.js`). Each world contains the next one at a position, rotation and scale. The bridge object (the glint on the TV glass, the copy glyph, the received-image preview on the second laptop, the beacon on the planet) is a portal. The next world is rendered into a texture by a camera mapped through that embedding, and the portal samples it in screen space. The real next scene is therefore visible inside the bridge object from the start.
- **Seamless crossing** (`src/journey/index.js`). When the camera reaches the portal plane, the portal fills the whole view, and rendering switches to the inner world at the equivalent pose. There is no cut, and no scene jump.
- **Camera path** (`src/journey/track.js`). Scroll maps to a value `g` from 0 to 9: hero, four transitions, four reading dwells. In a transition, the distance to the target object is interpolated in log space, which keeps a constant zoom rate and reads as falling. Each pose is a pure function of `g`, so scrolling back retraces the path exactly.
- **Portal shader** (`src/journey/portal.js`). It adds smoke, a cobalt rim with edge refraction, and a sheen that follows the viewing angle. A pointer lens clears the smoke, magnifies, and splits colour, and the effect is confined to the aperture.
- **The TV** (`buildCRT` in `src/journey/worlds.js`). The screen is a shader of live static with scanlines, a rolling bar and dark tube corners. A small reflection in its top-right corner is the portal; the screen draws the same white around it, so the edge disappears. Up close, the grain smooths out, so the zoom melts into white before the SyncDocs page appears.
- **Pointer look-around.** The camera orbits its focus point slightly, and the orbit is stronger on the hero. It eases back to centre when the pointer leaves. Scroll alone decides progress.
- **The TV screen.** It powers on with a bright line when the page loads. The pointer bends the static like a magnet held to the tube, with colour fringes. A click degausses the picture and turns the channel dial. Hovering the glint lets you peek at the page behind it.
- **Scene interactions** (the cursor labels each one):
  - SyncDocs: click to type a line and watch the autosave states (Unsaved changes, then Saving…, then Saved).
  - Clipboard Sync: click to copy something new; the clip flies to the other laptop and its screen updates.
  - Final Transmission: the planet follows the pointer, and a small beacon on it sends out pulsing signal rings.
  - Still Pavilion: the pointer sets the time of day, from morning to dusk.
- **Readout.** A live readout shows the scene, the magnification relative to the hero, and the depth.
- **Text is HTML.** Titles, descriptions and links are semantic HTML laid over the canvas, and never part of the 3D scene.

## Layouts

`index.html` picks the layout before first paint:

- **Journey (default):** any screen at least 960 × 500 with WebGL. The reduced-motion setting does not switch it off.
- **Desktop required:** phones and smaller windows. The page shows the name, a share or copy-link button, and direct links to the four projects and GitHub. A window that is widened switches to the journey.
- **Linear:** the readable fallback when WebGL is unavailable, or when forced with `?mode=linear`. Three.js is never downloaded. `?mode=journey` forces the journey, even on a small screen.

**Hardware acceleration notice.** The page asks WebGL which renderer it is using. A software renderer (SwiftShader, llvmpipe, Microsoft Basic Render), missing WebGL, or under 24 fps over the first four seconds shows a small notice. It explains how to turn acceleration on in Chrome, Edge, Firefox and Safari, and has a button that copies the settings address. A page cannot change the setting itself. Dismissing the notice hides it for the session.

**View all work** in the header links straight to all four live projects, and to each scene.

## Content sources

- **SyncDocs** captures were taken from the live app (https://syncdocs-lut9.onrender.com/) with a throwaway account.
- **Final Transmission** and **Still Pavilion** captures were taken from their live sites.
- **Universal Clipboard Sync** has no published screenshots, so its laptops and app screens are a stylised illustration of the real flow.
- **Claims** follow the projects' own READMEs. SyncDocs does not yet do real-time co-editing. 

## Checks

`tests/journey-check.mjs` drives headless Chromium with software WebGL against `npm run preview`. It checks:

- the look-around, the magnet effect on the TV screen, the degauss click and the peek through the glint, with the text unchanged;
- easing back to centre;
- reversal at four points, comparing pose and image;
- keyboard reach of every project link;
- the View all work panel and its shortcut jumps;
- the desktop-required phone page, the journey under reduced motion, the hardware acceleration notice, and the linear and no-WebGL layouts.

```bash
cd tests && npm install && npx playwright install chromium
node journey-check.mjs ./shots
```
