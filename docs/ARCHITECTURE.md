# County Line — architecture

What each system is, why it is the way it is, and where to extend it.
Written for whoever picks this up at Stage 2 with a set of measured
drawings and a building to reconstruct.

---

## The shape of it

```
                index.html
                    |
                 main.js
                    |
                  Game  ------------------ the loop and the state machine
                 /  |  \                   and deliberately nothing else
                /   |   \
          systems   |    screens
                    |
        +-----------+-----------+
        |           |           |
      Level      Campaign     Settings / Save
        |
   +----+----+----------+-------------+
   |         |          |             |
 chunks  collision  interactables   doors
```

`Game` owns the frame, the state machine and the handful of callbacks the
world reaches back through. It does not own gameplay. When the job
simulation arrives it will be modules registered with the play state, not
methods added to `Game`.

**The size limit is enforced.** `npm run lint` fails on any source file
over 900 lines. Final Rental's `game.js` reached 4,295, and a change to
how doors sounded was a change to the same file as the ending sequence.

---

## Renderer

A software rasterizer — no WebGL, no shaders. `Raster` transforms
vertices with a 3×4 affine matrix, divides by view-z itself (which is what
the PlayStation's GTE did), snaps to integer pixels, maps textures
affinely, shades per vertex and writes into one `Uint32Array` that goes
straight to `putImageData`.

It renders at 320×240 by default into a canvas that the CSS scales up with
`image-rendering: pixelated`, so the picture is genuinely low-resolution
rather than filtered to look it. `PostFX` then runs the frame through a
CRT: 15-bit ordered dither, chroma bleed, phosphor persistence,
scanlines, grain and a vignette.

**Retro does not mean loose.** Straight walls, right angles and consistent
dimensions all survive this pipeline intact; the look comes from
resolution, color depth and vertex snapping, not from distorting the
building. Do not skew the Old Academy for atmosphere.

Three things were changed from Final Rental's version, all for the sake
of a larger building:

- **The far plane is not the fog.** Final Rental culled anything past
  `fogFar * 1.6`, which is correct when nothing is further away than the
  fog and wrong down a 30 m hall. `raster.far` is its own number.
- **`boxVisible`** tests a room's bounds against the frustum, so geometry
  is submitted per room rather than all at once.
- **Automatic subdivision** in `MeshBuilder`: every quad is cut to
  `maxEdge` meters. Affine mapping shears across a big triangle, and
  vertex lighting on an unsplit 20 m wall is two triangular gradients.

### Extending it for the Old Academy

- One chunk per room is the granularity (`b.room()` opens one). A room
  larger than about 15 m across is worth splitting into several chunks
  with explicit bounds, because the culler tests a bounding sphere and a
  big room's sphere is always visible.
- `b.detail(metres)` sets subdivision per chunk. Lower it for surfaces
  under a light fitting; raise it for the far side of a courtyard.
- `raster.setFog(near, far)` is set per level and switched
  interior/exterior at runtime.

---

## Collision

`CollisionWorld` is not a physics engine and should not become one. Four
kinds of thing:

| | |
|---|---|
| **solid** | an AABB that blocks horizontally, over the part of its height the body occupies |
| **floor** | a flat rectangle at a height; every solid also offers its own top unless it opts out |
| **ramp** | a rectangle that slopes along X or Z — this is what a staircase actually is |
| **ceiling** | consulted only to refuse a step-up that would put a head through something |

Movement is `move(body, dx, dz, dt)`: sweep horizontally in substeps no
longer than half a radius, resolve the deepest overlap first over four
passes, then resolve vertically — step up, snap down a shallow ledge, or
fall.

One rule does most of the work: **a solid whose top is within a step of
the feet does not block at all.** Thresholds, curbs and low platforms need
no special case.

### Stairs

The visible treads and risers are **geometry only**. The player walks on a
single ramp collider underneath them. That is why the climb is smooth, why
stopping halfway leaves you halfway, why turning on the flight is safe,
and why there is no per-tread seam to catch on. It is emphatically not a
trigger that snaps anybody anywhere: move up the ramp and you rise; stop
and you stay.

`SCALE.stepHeight` (7 in) is deliberately below `SCALE.stairRise` (7½ in)
so the step-up rule can never be what climbs a staircase.

### What it does not do

Walls must be axis-aligned, because an AABB that has to be rotated is not
an AABB. County Line's building is orthogonal in its main runs. Anything
angled in Stage 2 should be modelled as geometry with a stepped collision
approximation rather than by giving the collider oriented boxes it would
then need a solver for.

---

## Levels

A level is a **module** exporting `{ id, name, build(b, materials) }`. It
may split itself across as many files as it likes. `LevelBuilder` is the
vocabulary:

```js
b.view(fogNear, fogFar, cullDistance);
b.light(pointLight(x, y, z, radius, intensity));   // BEFORE the geometry
b.lighting({ ambient, sky });                       // swap models mid-build
b.room({ id, x0, x1, z0, z1, y0, y1 });            // opens a chunk
b.floor({ ...rect, y, material });
b.ceiling({ ...rect, y, material });
b.wallWith({ x0, z0, x1, z1, y0, y1, thickness, material, openings: [
  { at, width, y0, y1, kind: 'door',   door:   { id, leaves, hinge, swing } },
  { at, width, y0, y1, kind: 'window', window: { material } },
]});
b.stairs({ x, z, y, yaw, steps, width });
b.railing(...); b.barrier(...); b.headroom(...); b.prop(...);
b.interactable({ id, box, describe });
b.spawn({ x, y, z, yaw });
b.navNode({ x, y, z }); b.navEdge(a, b);
```

**Lights are declared before the geometry they light**, because vertex
shade is baked as vertices are created.

**Floors run to wall center-lines, not to the inside faces.** A floor that
stops at the plaster leaves a gap the thickness of the wall under every
doorway, and the collider starts the player falling for the two frames it
takes to cross a threshold. The overlap under a wall is never seen.

A light switch works by scaling a room's chunk shade (`level.chunkShade`)
rather than re-baking. Baked light cannot be re-lit cheaply; scaling the
shade of that room's geometry is what a light going out looks like on
hardware that bakes its lighting.

---

## Interaction

An interactable **describes itself**:

```js
b.interactable({
  id: 'ticket-window',
  box: { x0, x1, y0, y1, z0, z1 },     // or cyl, or boxFn for moving things
  priority: 1,                          // breaks ties with the wall behind it
  describe: (ctx) => ({
    text: 'Open the window',
    sub: 'the shutter is stiff',
    hold: 0.6,                          // 0 for a tap
    action: () => ctx.openShutter(),
  }),
});
```

`InteractionSystem` casts, sorts, checks the line of sight against the
collider and asks the winner. **There is no switch on object type and
there must not be one.** Final Rental's was 200 lines and every new
interactable added an arm to it.

`ctx` is assembled in one place — `Game.ctx()` — which is the whole of the
game's exposed surface to the world. Add to it deliberately.

Make the look box for a low object **taller than the object**. A player
standing in front of something waist-high and looking straight ahead is
looking over it, and a prompt that only appears when you remember to look
down gets reported as broken.

---

## Doors

One `Door` component. Single or double leaves, hinged at either jamb,
swinging either way, lockable, optionally key-gated, optionally
self-closing. It contributes a collider while it is shut and withdraws it
while it is open, so nothing walks through a closed door and nothing is
trapped behind an open one. The frame is static geometry; each leaf is a
small mesh with a matrix.

---

## Input

Everything is an **action**. `ACTIONS` in `src/engine/input.js` declares
each one with its default keys and pad buttons; the game asks for
`forward`, never for `KeyW`. Both devices rebind into the same table, and
prompts name whatever is currently bound.

A press is taken from the key **event**, not from comparing this frame's
held set with last frame's — a tap that goes down and up between two
frames never appears in the held set at all.

Carried over from Final Rental, and hard-won there: the deadzone curves
(squared for moving, gentler for looking), the stick-as-menu-arrows edge
detector, the hat switch that must prove it is a hat before it is
believed, and the layout table for the Xbox pads that Chrome and Safari on
macOS refuse to describe.

New: Gecko reports pointer-lock `movementX`/`movementY` in **device**
pixels rather than CSS pixels, so on any Retina display Firefox is twice
as sensitive as Chromium. `Input.pointerScale` corrects it.

---

## Audio

Five buses: `master`, `ambience`, `sfx`, `voice`, `ui`. Effects are
compressed; ambience runs straight to master so a footstep cannot duck the
room tone; there is a safety limiter across the output. Every sound is
synthesized — `tone()` and `noise()` in the engine, the game's cues in
`src/game/sfx.js`. Positional sound comes in two forms: `spatial()` for
one-shots and `Emitter` for loops that live in the world.

`AudioEngine.init()` must be called from inside a user gesture. Every
browser refuses otherwise, and Safari hands back a permanently suspended
context if you try.

---

## Save and settings

Two separate records under the `countyline.` namespace, with different
lifetimes: deleting a save must not reset a sensitivity slider.

Every record is versioned and runs through a migration chain on load. A
record that does not parse, does not validate, or claims a version from
the future is moved aside under a `.corrupt` key and the caller gets
defaults. Nothing throws — a private window refuses `localStorage`
outright, and a game that dies on the options screen because it could not
remember a volume is a worse game than one that forgets the volume.

`SaveGame.capture()` **preserves unknown keys inside `world`**, so a save
written by a later build and opened by an earlier one does not silently
lose that build's state.

`npm run lint` fails if anything outside `src/engine/storage.js` touches
`localStorage`, or if anything in `src/` names `finalrental`.

---

## Campaign

`CampaignDef` is an ordered list of shifts declared as data. `Campaign`
holds which shift is current, the persistent flags, the per-shift
objectives and the wall clock. Stage 1 ships one shift, on the testbed,
with three objectives that exist only so objective tracking has something
to track.

There is no story here and there must not be one before its stage.

---

## NPCs

`Npc` is a position, a path and a small state machine — `{ enter, update,
exit }` per state. `NavGraph` is a declared waypoint graph with Dijkstra
over it, and nodes carry a height, so a route from the ground floor to an
upstairs office goes up the stairs rather than through the ceiling.

`actor.js` keeps Final Rental's *technique* — lofted cross-sections rather
than boxes — and none of its content. There is no appearance system, no
wardrobe and no trait model; those existed because that game was about
describing a suspect.

A walker that has not moved for a second and a half drops its waypoint.
Walking somewhere is allowed to fail; standing there failing forever is
not.
