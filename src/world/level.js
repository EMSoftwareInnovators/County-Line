/* ============================================================
   level.js -- what a County Line level IS, and how one gets built.

   Final Rental's world.js was a single 1100-line file with one
   `buildWorld()` at the bottom of it that laid out the whole store --
   geometry, shelves, props, lighting, collision and spawn points -- in one
   pass, with the floor plan written into the comments at the top. That was
   proportionate to a 13 x 9.6 meter store. It is not proportionate to a
   two-floor building with a courtyard, and a second function like it is
   exactly the "one giant unmaintainable world-building function" this
   stage exists to make impossible.

   So a level is data plus small modules:

     * A level MODULE (src/world/levels/*.js) exports a plain object with a
       name, some settings, and a `build(b)` that calls the builder. It may
       split itself across as many files as it likes -- a shell module, a
       first-floor module, a props module -- and nothing here cares.

     * The BUILDER (LevelBuilder) is the vocabulary: rooms, walls, floors,
       stairs, doors, windows, props, lights, interactables, spawns. It
       delegates the geometry to prefabs.js and collects the results.

     * The LEVEL (Level) is the built result: a handful of static meshes
       chunked by room so the renderer can cull them, a collision world, a
       door list, an interaction system and a room lookup.

   CHUNKING IS THE OTHER HALF OF THE POINT. Final Rental drew its whole
   store as one mesh every frame, which is right when the store is one
   room and wrong the moment there is a floor above you that you cannot
   see. Geometry goes into a chunk per room; a chunk whose bounding box is
   outside the frustum is never submitted.
   ============================================================ */
import { MeshBuilder } from '../engine/mesh.js';
import { CollisionWorld } from '../engine/collision.js';
import { InteractionSystem, Interactable } from '../game/interaction.js';
import { Door, buildDoorFrame } from '../game/door.js';
import { makeLightSampler } from './lighting.js';
import { wallRun, stairFlight, railing, boxProp, glazing } from './prefabs.js';
import { SCALE } from '../engine/units.js';
import { mat } from '../engine/mathx.js';

export class Level {
  constructor(def) {
    this.id = def.id;
    this.name = def.name;
    /** [{ id, mesh, bounds, room }] -- static geometry, culled per chunk. */
    this.chunks = [];
    /** [{ mesh, matrix() }] -- door leaves and anything else that moves. */
    this.dynamic = [];
    this.collision = new CollisionWorld();
    this.interact = new InteractionSystem(this.collision);
    this.doors = [];
    /** Cased openings: a doorway with no leaf in it. Recorded for the
        same reason doors are -- anything that wants to know where a wall
        is interrupted (the wainscot, the navigation graph, a later fit-out)
        has to see these too, and an archway it cannot see is an archway it
        runs a chair rail across. */
    this.openings = [];
    /** Things standing against a wall that the trim has to stop at: a
        chimney breast, a built-in, a stair stringer. A chair rail stops at
        one for exactly the reason it stops at a doorway -- something else
        is already there -- and the alternative is a board running straight
        through nine inches of masonry, which is what the central room's
        wainscot did until it was recorded here. */
    this.obstructions = [];
    this.lights = [];
    this.rooms = [];
    this.props = [];
    this.spawn = { x: 0, y: 0, z: 0, yaw: 0 };
    /** Per-level render settings the game applies to the rasterizer. */
    this.fog = { near: 8, far: 42 };
    this.far = 90;
    this.sky = 0xFF0C0A08;
    /** Named points a level can hand to scripts and NPCs. */
    this.marks = {};
    this.navNodes = [];
    this.navEdges = [];
    this.ambient = [];
    /**
     * Per-room light multiplier, applied to every chunk of that room at
     * draw time. Vertex light is baked, so a switch cannot re-light a
     * room -- but scaling the shade of the room's own geometry is cheap,
     * costs nothing while it is 1, and is exactly what a light going out
     * looks like on hardware that bakes its lighting.
     */
    this.chunkShade = {};
    /**
     * Per-chunk blend between the two baked shade terms: 1 is lit, 0 is
     * the same geometry with every switchable fitting off. This is what a
     * breaker actually does. See MeshBuilder.dark.
     */
    this.chunkLit = {};
    /** Per-frame stats the debug overlay reads. */
    this.stats = { chunks: 0, chunksDrawn: 0, tris: 0 };
  }

  /** The room containing a point, or null outdoors. */
  roomAt(x, y, z) {
    let best = null;
    for (let i = 0; i < this.rooms.length; i++) {
      const r = this.rooms[i];
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
      if (y < r.y0 - 0.6 || y > r.y1 + 0.2) continue;
      /* Rooms may be stacked; take the one whose floor is nearest under
         the point, which is the one the player is standing in. */
      if (!best || r.y0 > best.y0) best = r;
    }
    return best;
  }

  doorById(id) { return this.doors.find((d) => d.id === id) || null; }

  /** Refresh the collider's dynamic list and animate anything that moves. */
  update(dt) {
    const dyn = this.collision.dynamic;
    dyn.length = 0;
    for (let i = 0; i < this.doors.length; i++) {
      this.doors[i].update(dt);
      this.doors[i].contributeSolids(dyn);
    }
    this.collision.refresh();
  }

  /** Submit the level. `opt.shade` is a global light multiplier. */
  draw(rz, opt = {}) {
    const m = opt.identity || (this._id || (this._id = mat()));
    let drawn = 0;
    const baseShade = opt.shade === undefined ? 1 : opt.shade;
    const sub = { ...opt };
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      if (!rz.boxVisible(c.bounds)) continue;
      const k = this.chunkShade[c.id];
      sub.shade = k === undefined ? baseShade : baseShade * k;
      const lit = this.chunkLit[c.id];
      sub.lit = lit === undefined ? 1 : lit;
      rz.drawMesh(c.mesh, m, sub);
      drawn++;
    }
    sub.shade = baseShade;
    for (let i = 0; i < this.dynamic.length; i++) {
      const d = this.dynamic[i];
      const mm = d.matrix();
      if (!mm) continue;
      /* A door leaf dims with the room it hangs in, or it is a bright
         rectangle in a dark doorway. */
      const dl = d.chunk === undefined ? undefined : this.chunkLit[d.chunk];
      sub.lit = dl === undefined ? 1 : dl;
      rz.drawMesh(d.mesh, mm, sub);
    }
    sub.lit = 1;
    this.stats.chunks = this.chunks.length;
    this.stats.chunksDrawn = drawn;
    this.stats.tris = rz.tris;
  }
}

/* ============================================================
   THE BUILDER
   ============================================================ */
export class LevelBuilder {
  constructor(level, materials) {
    this.level = level;
    this.M = materials;
    this._chunks = new Map();
    this._chunk = null;
    this.lightAt = makeLightSampler({
      lights: level.lights,
      ambient: 0.26,
      sky: 0,
    });
    this.darkAt = makeLightSampler({
      lights: level.lights,
      ambient: 0.09,
      sky: 0,
      only: 'fixed',
    });
    this.chunk('default');
  }

  /* ---------------- settings ---------------- */

  /** Fog band and hard view distance, in meters. */
  view(near, far, cull) {
    this.level.fog = { near, far };
    if (cull) this.level.far = cull;
    return this;
  }

  sky(colorAbgr) { this.level.sky = colorAbgr >>> 0; return this; }

  /** Ambient floor and sky term for baked lighting. Call before geometry. */
  lighting({ ambient, sky, skyDir, max, darkAmbient }) {
    this.lightAt = makeLightSampler({
      lights: this.level.lights,
      ambient, sky, skyDir, max,
    });
    /* THE SAME ROOM WITH THE FITTINGS OFF, baked alongside the lit one.
       `darkAmbient` is what is left when the breaker is out: not zero --
       a room in a working building at night still has a doorway and a
       window in it -- but low enough that the difference is the point.
       Defaults to a third of the lit ambient. */
    this.darkAt = makeLightSampler({
      lights: this.level.lights,
      ambient: darkAmbient === undefined ? ambient * 0.34 : darkAmbient,
      sky, skyDir, max, only: 'fixed',
    });
    for (const c of this._chunks.values()) {
      c.mb.light = this.lightAt;
      c.mb.dark = this.darkAt;
    }
    return this;
  }

  /* ---------------- chunks ---------------- */

  /**
   * Select the chunk geometry goes into from here on. One per room is the
   * right granularity: big enough that the per-chunk overhead is nothing,
   * small enough that a room you cannot see costs nothing to skip.
   */
  chunk(id, bounds) {
    let c = this._chunks.get(id);
    if (!c) {
      const mb = new MeshBuilder();
      mb.light = this.lightAt;
      mb.dark = this.darkAt;
      c = { id, mb, bounds: bounds || null };
      this._chunks.set(id, c);
    }
    if (bounds) c.bounds = bounds;
    this._chunk = c;
    return this;
  }

  /** How finely quads in this chunk are subdivided, in meters per cell. */
  detail(meters) { this._chunk.mb.maxEdge = meters; return this; }

  get mb() { return this._chunk.mb; }
  get col() { return this.level.collision; }

  /* ---------------- declarations ---------------- */

  /**
   * A named volume. Used for the debug read-out, for picking a fog band,
   * for room tone, and later for anything that needs to know where it is.
   */
  room(spec) {
    const r = {
      id: spec.id,
      name: spec.name || spec.id,
      x0: spec.x0, x1: spec.x1, z0: spec.z0, z1: spec.z1,
      y0: spec.y0 === undefined ? 0 : spec.y0,
      y1: spec.y1 === undefined ? (spec.y0 || 0) + SCALE.roomHeight : spec.y1,
      /* THE HOUSE CONVENTION, and it is American: floor 1 is the floor
         you walk in on, floor 2 is the one above it. 0 means grade --
         outdoors, the grounds, a courtyard below the entrance level. A
         level that numbers its floors any other way makes `room.floor`
         mean nothing across levels, which is how "upstairs" came to mean
         two different things in two buildings. */
      floor: spec.floor === undefined ? 0 : spec.floor,
      outdoor: !!spec.outdoor,
      material: spec.material || 'stone',
    };
    this.level.rooms.push(r);
    this.chunk(spec.id, {
      x0: r.x0 - 0.5, x1: r.x1 + 0.5,
      y0: r.y0 - 0.5, y1: r.y1 + 0.5,
      z0: r.z0 - 0.5, z1: r.z1 + 0.5,
    });
    return r;
  }

  /** Grow the current chunk's bounds to include a box. */
  extend(b) {
    const c = this._chunk;
    if (!c.bounds) { c.bounds = { ...b }; return this; }
    const o = c.bounds;
    o.x0 = Math.min(o.x0, b.x0); o.x1 = Math.max(o.x1, b.x1);
    o.y0 = Math.min(o.y0, b.y0); o.y1 = Math.max(o.y1, b.y1);
    o.z0 = Math.min(o.z0, b.z0); o.z1 = Math.max(o.z1, b.z1);
    return this;
  }

  light(l) { this.level.lights.push(l); return l; }

  mark(name, p) { this.level.marks[name] = p; return p; }

  spawn(p) { this.level.spawn = { yaw: 0, ...p }; return this; }

  /* ---------------- surfaces ---------------- */

  /**
   * A walkable slab. `collide: false` for something purely decorative.
   * Thickness is geometry only; the collider is the top face.
   *
   * `pad` grows the COLLIDER, and only the collider, by that much on all
   * four sides.
   *
   * THE SLAB YOU CAN SEE STOPS AT THE PLASTER; THE FLOOR YOU STAND ON
   * REACHES UNDER IT. A slab drawn out to the outer face of the masonry
   * puts its edge face in exactly the plane of the wall's own outer face,
   * with its bottom foot and a half inside the wall -- two surfaces in one
   * plane fighting for every pixel they share, right along the string
   * course, the whole way round the building. Drawing it to the inner
   * face fixes that and opens a different hole: an external doorway is a
   * gap in the masonry nineteen inches deep with no floor under it, and
   * the player drops through the threshold. So the geometry stops at the
   * plaster and the collider goes under the wall, which is what a real
   * floor structure does anyway.
   */
  floor(spec) {
    const m = spec.material;
    const y = spec.y === undefined ? 0 : spec.y;
    const th = spec.thickness === undefined ? 0.2 : spec.thickness;
    this.mb.box(spec.x0, y - th, spec.z0, spec.x1, y, spec.z1, {
      all: { tex: m.tex, density: m.density },
      /* The underside of a first-floor slab is the ceiling of the room
         below, and is usually a different material. `buried` is for a
         slab bedded in the ground, which has no underside at all: drawn,
         it is a face with nothing in front of it, lying in the same
         plane as the underside of everything else sitting on the same
         grade and fighting all of them for it. */
      ny: spec.buried ? null
        : spec.soffit ? { tex: spec.soffit.tex, density: spec.soffit.density } : undefined,
    });
    if (spec.collide !== false) {
      const p = spec.pad || 0;
      this.col.addFloor({
        x0: spec.x0 - p, x1: spec.x1 + p, z0: spec.z0 - p, z1: spec.z1 + p,
        y, tag: spec.tag || 'floor', material: m.material,
      });
    }
    this.extend({ x0: spec.x0, x1: spec.x1, y0: y - th, y1: y, z0: spec.z0, z1: spec.z1 });
    return this;
  }

  /** A ceiling plane. Registers headroom as well as drawing it. */
  ceiling(spec) {
    const m = spec.material;
    const y = spec.y;
    const th = spec.thickness === undefined ? 0.12 : spec.thickness;
    this.mb.box(spec.x0, y, spec.z0, spec.x1, y + th, spec.z1, {
      all: { tex: m.tex, density: m.density },
    });
    if (spec.collide !== false) {
      const p = spec.pad || 0;
      this.col.addCeiling({
        x0: spec.x0 - p, x1: spec.x1 + p, z0: spec.z0 - p, z1: spec.z1 + p,
        y, tag: spec.tag || 'ceiling',
      });
    }
    this.extend({ x0: spec.x0, x1: spec.x1, y0: y, y1: y + th, z0: spec.z0, z1: spec.z1 });
    return this;
  }

  /**
   * Headroom with no geometry: the underside of a slab that has already
   * been drawn as somebody else's floor. Registering it is what stops the
   * player stepping up into the floor above.
   */
  headroom(spec) {
    const p = spec.pad || 0;
    this.col.addCeiling({
      x0: spec.x0 - p, x1: spec.x1 + p, z0: spec.z0 - p, z1: spec.z1 + p,
      y: spec.y, tag: spec.tag || 'slab',
    });
    return this;
  }

  /**
   * Collision with no geometry: the edge of a gallery behind a railing,
   * the back of a fireplace, anywhere the thing that stops you is not the
   * thing you can see.
   */
  barrier(spec) {
    this.col.addSolid({
      x0: spec.x0, x1: spec.x1, y0: spec.y0, y1: spec.y1, z0: spec.z0, z1: spec.z1,
      tag: spec.tag || 'barrier', walkable: false, noOcclude: spec.noOcclude !== false,
    });
    return this;
  }

  /** @see prefabs.wallRun */
  wall(spec) {
    const holes = wallRun(this.mb, this.col, spec);
    const y1 = spec.y1;
    this.extend({
      x0: Math.min(spec.x0, spec.x1) - 0.2, x1: Math.max(spec.x0, spec.x1) + 0.2,
      y0: spec.y0, y1,
      z0: Math.min(spec.z0, spec.z1) - 0.2, z1: Math.max(spec.z0, spec.z1) + 0.2,
    });
    return holes;
  }

  /**
   * A wall, and the doors and windows in it, in one declaration.
   *
   * This is the call a level actually wants: the opening and the thing
   * that fills it are one fact, and splitting them across two calls is how
   * a doorway ends up with a leaf a hand's width off the hole.
   */
  wallWith(spec) {
    const holes = this.wall(spec);
    const alongX = Math.abs(spec.x1 - spec.x0) > 1e-6;
    for (const h of holes) {
      const cx = alongX ? spec.x0 + h.at : spec.x0;
      const cz = alongX ? spec.z0 : spec.z0 + h.at;
      /* A wall running along X faces +/- Z, and vice versa. `facing` picks
         which side is the front, and therefore which way a door swings by
         default. */
      const yaw = alongX ? (h.facing === -1 ? Math.PI : 0)
        : (h.facing === -1 ? -Math.PI / 2 : Math.PI / 2);
      if (h.door) {
        /* THE LEAF SITS IN ITS OWN OPENING, NOT AT THE FOOT OF THE WALL.
           This read `y: spec.y0` until Stage 2.1, which is the same thing
           only while a wall begins exactly at its doorway's threshold. It
           does not for a second-story door -- the run starts at the second
           floor but the wall below it is one run from grade -- and it does
           not for a wall that begins below grade, which the front porch's
           flanking walls do. Both cases put a leaf feet away from the hole
           it belongs in, with the masonry that should have been under the
           threshold standing in the doorway instead. `_y` is what wallRun
           actually cut, so `_y` is what the door is hung in. */
        this.door({
          x: cx, z: cz, yaw,
          y: h._y[0],
          width: h.width, height: h._y[1] - h._y[0],
          depth: spec.thickness,
          ...h.door,
        });
      } else if (h.kind === 'arch' || (!h.window && h.kind !== 'window')) {
        /* A CASED OPENING IS STILL AN OPENING. It gets the same architrave
           a door does -- every doorway in the building is cased, whether
           or not something hangs in it -- and it goes on the level's
           opening list so the trim knows to stop at it. */
        this.cased({
          x: cx, z: cz, yaw,
          y: h._y[0], width: h.width, height: h._y[1] - h._y[0],
          depth: spec.thickness,
          material: h.frameMaterial,
        });
      } else if (h.window) {
        this.window({
          x0: alongX ? cx - h.width / 2 : cx - (spec.thickness || SCALE.wallThickness) / 2,
          x1: alongX ? cx + h.width / 2 : cx + (spec.thickness || SCALE.wallThickness) / 2,
          z0: alongX ? cz - (spec.thickness || SCALE.wallThickness) / 2 : cz - h.width / 2,
          z1: alongX ? cz + (spec.thickness || SCALE.wallThickness) / 2 : cz + h.width / 2,
          y0: h._y[0], y1: h._y[1],
          ...h.window,
        });
      }
    }
    return holes;
  }

  /* ---------------- doors ---------------- */

  /**
   * A doorway with nothing hanging in it: the architrave, and a record of
   * where the wall stops.
   */
  cased(spec) {
    const m = spec.material || this.M.trim;
    /* buildDoorFrame wants something door-shaped. A cased opening is a
       door minus the leaf, so it is handed the same five numbers. */
    const like = {
      x: spec.x, z: spec.z, y: spec.y, yaw: spec.yaw,
      width: spec.width, height: spec.height,
      get right() { return [Math.cos(this.yaw), -Math.sin(this.yaw)]; },
    };
    buildDoorFrame(this.mb, like, m, { depth: spec.depth });
    this.level.openings.push({
      x: spec.x, z: spec.z, y: spec.y, yaw: spec.yaw,
      width: spec.width, height: spec.height,
    });
    return like;
  }

  door(spec) {
    const d = new Door(spec);
    const leafMat = spec.material || this.M.door;
    const frameMat = spec.frameMaterial || this.M.trim;
    buildDoorFrame(this.mb, d, frameMat, { depth: spec.depth });

    const n = d.leaves;
    for (let i = 0; i < n; i++) d.buildLeafMesh(leafMat, this.lightAt);
    for (let i = 0; i < n; i++) {
      this.level.dynamic.push({
        mesh: d.leafMeshes[i],
        matrix: () => d.matrices()[i],
      });
    }

    /* The door's collider is built now but NOT registered: a door is in
       the way only while it is shut, and Level.update puts it into the
       per-frame dynamic list when it is. */
    d.makeSolid();

    d.interactable = this.level.interact.add(new Interactable({
      id: `door:${d.id}`,
      owner: d,
      boxFn: () => d.interactBox(),
      priority: 1,
      describe: (ctx) => {
        if (d.locked) {
          return { text: d.lockedText, sub: '', action: () => ctx.doorLocked(d), hold: 0 };
        }
        return {
          text: d.open ? d.closeText : d.openText,
          sub: '',
          action: () => ctx.useDoor(d),
          hold: 0,
        };
      },
    }));
    this.level.doors.push(d);
    return d;
  }

  /* ---------------- openings ---------------- */

  window(spec) {
    glazing(this.mb, { ...spec, material: spec.material || this.M.glass });
    if (spec.sill !== false) {
      const m = spec.sillMaterial || this.M.trim;
      const t = 0.05;
      this.mb.box(spec.x0 - 0.04, spec.y0 - t, spec.z0 - 0.04, spec.x1 + 0.04, spec.y0, spec.z1 + 0.04,
        { all: { tex: m.tex, density: m.density } });
    }
    return this;
  }

  /* ---------------- stairs ---------------- */

  stairs(spec) {
    const r = stairFlight(this.mb, this.col, {
      treadMaterial: spec.treadMaterial || this.M.tread,
      riserMaterial: spec.riserMaterial || this.M.riser,
      ...spec,
    });
    this.extend({
      x0: Math.min(spec.x, r.top.x) - 2, x1: Math.max(spec.x, r.top.x) + 2,
      y0: (spec.y || 0) - 0.3, y1: r.top.y + 2.2,
      z0: Math.min(spec.z, r.top.z) - 2, z1: Math.max(spec.z, r.top.z) + 2,
    });
    return r;
  }

  railing(spec) {
    railing(this.mb, { material: this.M.trim, ...spec });
    return this;
  }

  /* ---------------- things in rooms ---------------- */

  prop(spec) {
    boxProp(this.mb, this.col, spec);
    this.extend(spec);
    this.level.props.push(spec);
    return spec;
  }

  interactable(spec) { return this.level.interact.add(new Interactable(spec)); }

  /** A looping ambient source, started when the level goes live. */
  ambience(spec) { this.level.ambient.push(spec); return this; }

  navNode(p) { this.level.navNodes.push(p); return this.level.navNodes.length - 1; }
  navEdge(a, b) { this.level.navEdges.push([a, b]); return this; }

  /* ---------------- finish ---------------- */

  finish() {
    for (const c of this._chunks.values()) {
      if (!c.mb.sh.length) continue;
      const mesh = c.mb.build();
      const b = c.bounds || {
        x0: mesh.bounds.x - mesh.bounds.r, x1: mesh.bounds.x + mesh.bounds.r,
        y0: mesh.bounds.y - mesh.bounds.r, y1: mesh.bounds.y + mesh.bounds.r,
        z0: mesh.bounds.z - mesh.bounds.r, z1: mesh.bounds.z + mesh.bounds.r,
      };
      this.level.chunks.push({ id: c.id, mesh, bounds: b });
    }
    this.level.collision.refresh();
    return this.level;
  }
}

/** Build a level from its module definition. */
export function buildLevel(def, materials) {
  const level = new Level(def);
  const b = new LevelBuilder(level, materials);
  def.build(b, materials);
  return b.finish();
}
