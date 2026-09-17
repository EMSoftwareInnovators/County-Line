# COUNTY LINE

A first-person horror game. This repository is at **Stage 1: the technical
foundation** — the engine, the systems and the test rig that the real game
gets built on. There is no game in it yet, and that is deliberate.

County Line is a spiritual follow-up to
[FINAL RENTAL](https://github.com/EMSoftwareInnovators/Final-Rental), and
inherits the proven parts of its technology: the software rasterizer, the
PS1-era look, the runtime-generated textures and audio, the gamepad
handling, the desktop shell. It is a separate game in a separate
repository and shares no content, no save data and no branding with it.

---

## Running it

You need [Node](https://nodejs.org) 18 or newer. Nothing else — the game
has no runtime dependencies and downloads nothing.

```sh
git clone https://github.com/EMSoftwareInnovators/County-Line.git
cd County-Line
npm install          # only for the test harnesses and the desktop build
npm start            # then open http://localhost:8080
```

`npm install` is not needed to play it. If you only want to run the game:

```sh
npm start
```

Browsers refuse to load ES modules from `file://`, so it has to be served
over `http://`. `serve.cjs` is forty lines of dependency-free Node whose
only job is to hand the files over with the right content type.

### As a desktop application

```sh
npm run app          # runs it in Electron from the repository
npm run dist:mac     # builds a .app for macOS (arm64 and x64)
```

The desktop build serves the game to itself over its own `game://` scheme
rather than running a socket inside a shipped game.

---

## What is in it

Stage 1 is a **technical testbed**, not a level. Pressing NEW TEST GAME
drops you into a deliberately plain greybox building built to test the
engine:

| Space | What it is there to test |
|---|---|
| Hall | a 14.7 × 13.6 m room with a **9 m ceiling** — long sightlines and a double-height volume |
| Staircase | 20 risers at 7½ in on an 11 in tread, hall to first floor |
| Gallery | a first floor open to the hall over a railed edge |
| Upper room | a small room off the gallery, behind a door |
| Corridor | 2.65 m wide and 13.6 m long — narrow, for scraping along walls |
| Workroom | an ordinary-height room with the windows and props |
| Yard | outside, through the front door, down a 150 mm step |

It contains one set of double doors, two interior single doors, one
exterior door, seven windows, one generic interactable, one light switch
and one NPC test actor. **It is disposable.** It is not the Old Academy,
it is not a bus terminal, and none of it should be kept.

### Controls

| | |
|---|---|
| **W A S D** | walk |
| **mouse** | look |
| **Shift** | hurry |
| **Ctrl** | crouch |
| **E** | use whatever you are looking at |
| **Esc** | pause |
| **F1** | cycle the developer read-out |
| **F2** | draw the collision world |
| **F3** | jump to the top of the stairs |

Everything above can be rebound, on the keyboard and on a controller,
from SETTINGS → CONTROLS. Xbox and PlayStation pads are both understood,
and a pad the browser will not describe can be laid out by hand.

---

## Scale

**One world unit is one meter.** Stage 2 will supply real architectural
measurements in feet and inches; convert them where they are written down,
with the helpers in `src/engine/units.js`, so the source reads as the
drawing does and the engine only ever sees meters.

```js
import { ft, ftin, inch } from './engine/units.js';
const WALL = ft(24);        // a 24-foot wall
const CEIL = ftin(14, 6);   // a 14 ft 6 in ceiling
const RISE = inch(7.5);     // a 7½ inch riser
```

Axes: **+X east, +Y up, +Z north**, so a floor plan drawn with north up
reads straight onto them. Yaw 0 faces +Z and increases toward +X.

The numbers everything else is tuned against, all in `SCALE`:

| | |
|---|---|
| Player height | 1.778 m (5 ft 10 in) |
| Eye height | 1.661 m (5 ft 5½ in) |
| Crouched eye | 1.016 m |
| Collision radius | 0.279 m (11 in) |
| Walk / hurry / crouch | 1.72 / 3.05 / 0.95 m/s |
| Step-up height | 0.178 m (7 in) |
| Door leaf | 2.032 × 0.914 m (6 ft 8 in × 3 ft) |
| Stair rise / run | 0.191 / 0.279 m (7½ in / 11 in) |

The step-up height is deliberately just under a stair riser, so a
staircase is always climbed by its ramp collider and never by the
step-up rule.

---

## Source layout

```
src/
  engine/          knows nothing about County Line
    units.js       the scale convention, and feet -> meters
    mathx.js       3x4 affine matrices, angles, seeded RNG
    raster.js      the software rasterizer
    mesh.js        mesh construction and automatic subdivision
    texture.js     runtime texture generation
    postfx.js      the CRT: dither, bleed, scanlines, vignette
    collision.js   solids, floors, ramps, ceilings; the only mover
    input.js       keyboard, mouse, gamepad -> actions
    audio.js       the mixer, the synthesizer, positional sound
    storage.js     versioned, namespaced, corruption-tolerant records

  game/            knows it is a game, not which one
    game.js        the loop and the state machine, and nothing else
    player.js      the first-person controller
    collision-driven movement, interaction, doors, NPCs, campaign, save

  world/           how a building is described
    level.js       Level and LevelBuilder
    prefabs.js     walls with openings, stairs, railings, glazing
    lighting.js    baked vertex light
    materials.js   the developer greybox materials
    levels/        one module per level
      testbed.js   the disposable test rig

  ui/              the front end, as DOM over the framebuffer
```

---

## Checks

```sh
npm test             # everything: lint, units, renderer, build, browsers
npm run lint         # house style, storage hygiene, module size, compat
npm run build        # the production build, into dist/web
npm run check:app    # the Electron build (needs a display; use xvfb-run)
```

`npm run build` produces `dist/web`, which is what gets uploaded. A built
page is marked as production and **withholds the developer hooks** — no
`window.__game`, no module namespace, nothing to reach into a level with
from the console. The development server and an unpackaged `npm run app`
keep them, which is how every harness here still works. A packaged desktop
build is marked the same way.

`npm test` runs the browser suite once **per installed engine**, and
reports an engine it cannot find as SKIPPED rather than quietly not
running it. Chromium and Gecko disagree about pointer-lock deltas, about
what `requestPointerLock()` returns and about when an `AudioContext` may
start, so working in one is not evidence of working in the other.

To add Firefox:

```sh
npx playwright install firefox
# or, to use one already installed:
COUNTY_LINE_FIREFOX="/Applications/Firefox.app/Contents/MacOS/firefox" npm test
```

---

## What Stage 1 is not

No Old Academy. No bus terminal. No buses, tickets, baggage or manifests.
No campaign, no story, no scares, no weather. The foundation is supposed
to be boring; the game comes next.

&copy; 2026 EM Software Innovators
