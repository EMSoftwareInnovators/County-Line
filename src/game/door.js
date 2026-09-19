/* ============================================================
   door.js -- a door that is a real object in the world.

   Final Rental had two doors and each was hand-written: `this.door` for
   the street entrance and `this.storage` for the back room, with their
   swing, their lock state, their collision and their sound spread across
   four methods of game.js and a pair of hard-coded x ranges in the
   collider. County Line's building has a lot of doors, so there is one
   component and the level declares instances of it.

   A door owns:
     - its leaves, one or two, hinged at either jamb, swinging either way
     - the collision that appears when it is shut and withdraws when it is
       not, so nothing walks through a closed door and nothing is trapped
       behind an open one
     - its lock, which may be a plain bolt or may be held by a story flag
     - the prompt it offers, which is a description rather than a branch in
       somebody else's if-chain
     - its own sound, if it has been given one

   Geometry is built into the level mesh for the frame and lining, which
   never move, and into a small mesh per leaf, which does.
   ============================================================ */
import { mat, setPosYaw, clamp } from '../engine/mathx.js';
import { MeshBuilder } from '../engine/mesh.js';
import { SCALE } from '../engine/units.js';

/** How far a leaf swings, in radians. About 100 degrees: it clears the
    opening completely and stops before it hits the wall behind it. */
const SWING = 1.75;
/** Below this, the doorway is still blocked. A door is shut or it is not. */
const CLEAR_AT = 0.30;

export class Door {
  /**
   * @param spec {
   *   id, name,
   *   x, z,            center of the opening, on the wall line
   *   y,               floor height at the opening (default 0)
   *   yaw,             which way the door faces; 0 faces +Z
   *   width, height,   clear opening, in meters
   *   leaves,          1 or 2
   *   hinge,           'x0' | 'x1' -- which jamb a single leaf hangs on
   *   swing,           +1 or -1; +1 opens away from the +Z side at yaw 0
   *   locked,          starts bolted
   *   key,             a name the game can check before it will unlock
   *   lockedText,      what the prompt says when it will not open
   *   openText, closeText,
   *   thickness, material, frameMaterial,
   *   autoClose,       seconds after which it shuts itself, or 0
   * }
   */
  constructor(spec) {
    this.id = spec.id;
    this.name = spec.name || 'door';
    this.x = spec.x; this.z = spec.z; this.y = spec.y || 0;
    this.yaw = spec.yaw || 0;
    this.width = spec.width || SCALE.doorWidth;
    this.height = spec.height || SCALE.doorHeight;
    this.leaves = spec.leaves === 2 ? 2 : 1;
    this.hinge = spec.hinge === 'x1' ? 'x1' : 'x0';
    this.swingDir = spec.swing === -1 ? -1 : 1;
    this.thickness = spec.thickness || 0.045;

    this.locked = !!spec.locked;
    this.key = spec.key || null;
    this.lockedText = spec.lockedText || 'It is locked.';
    this.openText = spec.openText || `Open the ${this.name}`;
    this.closeText = spec.closeText || `Close the ${this.name}`;
    this.autoClose = spec.autoClose || 0;
    /* A door in the envelope rather than in a partition. The building
       distinguishes them for real reasons -- an exterior door is on the
       opening and closing procedure, it is what "unlock the front
       doors" means, and it is the one kind of door nobody walking the
       building at handover would prop open. See shell.js, which is the
       only place that sets it. */
    this.exterior = !!spec.exterior;

    /** 0 shut, 1 fully open. Animated. */
    this.amount = 0;
    this.target = 0;
    this._autoT = 0;
    /** Set by the level; the collider it registers while it is shut. */
    this.solid = null;
    /** Built by buildLeafMesh(); one per leaf. */
    this.leafMeshes = [];
    this._m = [mat(), mat()];
  }

  get open() { return this.target > 0.5; }
  /** True while the doorway is passable. */
  get clear() { return this.amount > CLEAR_AT; }

  /** Unit vector along the wall the door sits in. */
  get right() { return [Math.cos(this.yaw), -Math.sin(this.yaw)]; }

  /* ---------------- state ---------------- */

  setOpen(on) {
    if (this.locked && on) return false;
    this.target = on ? 1 : 0;
    this._autoT = on ? this.autoClose : 0;
    return true;
  }

  toggle() { return this.setOpen(!this.open); }

  /** @returns 'opened' | 'closed' | 'locked' -- what the caller should play. */
  use(ctx) {
    if (this.locked) {
      if (this.key && ctx && ctx.hasKey && ctx.hasKey(this.key)) {
        this.locked = false;
        this.setOpen(true);
        return 'unlocked';
      }
      return 'locked';
    }
    const wasOpen = this.open;
    this.setOpen(!wasOpen);
    return wasOpen ? 'closed' : 'opened';
  }

  update(dt) {
    if (this._autoT > 0) {
      this._autoT -= dt;
      if (this._autoT <= 0) this.target = 0;
    }
    /* Opens quickly, closes slower -- a door that shuts as fast as it
       opens reads as spring-loaded, and most doors are not. */
    const k = this.target > this.amount ? 7 : 3.4;
    this.amount += (this.target - this.amount) * Math.min(1, dt * k);
    if (Math.abs(this.target - this.amount) < 0.002) this.amount = this.target;
  }

  /* ---------------- collision ---------------- */

  /** The box that stands in the opening while the door is shut. */
  makeSolid() {
    const [rx, rz] = this.right;
    const hw = this.width / 2, t = Math.max(0.09, this.thickness * 2);
    const x0 = this.x - Math.abs(rx) * hw - Math.abs(rz) * t / 2;
    const x1 = this.x + Math.abs(rx) * hw + Math.abs(rz) * t / 2;
    const z0 = this.z - Math.abs(rz) * hw - Math.abs(rx) * t / 2;
    const z1 = this.z + Math.abs(rz) * hw + Math.abs(rx) * t / 2;
    this.solid = {
      x0, x1, z0, z1,
      y0: this.y, y1: this.y + this.height,
      tag: 'door', door: this, walkable: false,
    };
    return this.solid;
  }

  /** Called once a frame by the level: shut doors block, open ones do not. */
  contributeSolids(out) {
    if (!this.solid) this.makeSolid();
    if (!this.clear) out.push(this.solid);
  }

  /** The box the interaction ray tests against. Wider than the leaf, so
      looking at a doorway from an angle still offers the door. */
  interactBox() {
    const [rx, rz] = this.right;
    const hw = this.width / 2 + 0.15;
    const dep = 0.35;
    return {
      x0: this.x - Math.abs(rx) * hw - Math.abs(rz) * dep,
      x1: this.x + Math.abs(rx) * hw + Math.abs(rz) * dep,
      y0: this.y + 0.15,
      y1: this.y + this.height,
      z0: this.z - Math.abs(rz) * hw - Math.abs(rx) * dep,
      z1: this.z + Math.abs(rz) * hw + Math.abs(rx) * dep,
    };
  }

  /* ---------------- rendering ---------------- */

  /**
   * Where each leaf is, right now.
   * @returns array of 3x4 matrices, one per leaf, reused between frames.
   */
  matrices() {
    const [rx, rz] = this.right;
    const hw = this.width / 2;
    const a = this.amount * SWING * this.swingDir;
    const out = [];
    if (this.leaves === 1) {
      const atX1 = this.hinge === 'x1';
      const hx = this.x + (atX1 ? rx * hw : -rx * hw);
      const hz = this.z + (atX1 ? rz * hw : -rz * hw);
      setPosYaw(this._m[0], hx, this.y, hz, this.yaw + (atX1 ? Math.PI : 0) + (atX1 ? -a : a));
      out.push(this._m[0]);
    } else {
      /* Two leaves, hinged at opposite jambs, swinging the same way. The
         second leaf is hung the other way round, so its swing is negated
         to keep the pair opening together rather than scissoring. */
      setPosYaw(this._m[0], this.x - rx * hw, this.y, this.z - rz * hw, this.yaw + a);
      setPosYaw(this._m[1], this.x + rx * hw, this.y, this.z + rz * hw, this.yaw + Math.PI - a);
      out.push(this._m[0], this._m[1]);
    }
    return out;
  }

  /**
   * Build the leaf geometry. Hinged at local origin, running along local
   * +X, facing local +Z, so the matrices above place it correctly.
   */
  buildLeafMesh(material, lightAt) {
    const w = this.leaves === 2 ? this.width / 2 : this.width;
    const t = this.thickness;
    const mb = new MeshBuilder();
    /* Flat-lit: a leaf swings through the room, so light baked from where
       it happens to be standing when the level is built would be wrong
       everywhere else. A single sample at the hinge keeps it in keeping
       with the room without lying about it. */
    const s = lightAt ? clamp(lightAt(this.x, this.y + this.height * 0.5, this.z), 0.25, 1.4) : 1;
    mb.light = () => s;
    const f = { tex: material.tex, density: material.density };
    mb.box(0.012, 0.01, -t / 2, w - 0.012, this.height - 0.01, t / 2, { all: f });
    this.leafMeshes.push(mb.build());
    return this.leafMeshes[this.leafMeshes.length - 1];
  }
}

/**
 * The static part: jambs, head and a threshold. Goes into the room mesh,
 * because none of it ever moves.
 */
export function buildDoorFrame(mb, door, material, opening) {
  const [rx, rz] = door.right;
  const hw = door.width / 2;
  const depth = opening && opening.depth ? opening.depth : 0.16;
  const f = { tex: material.tex, density: material.density };

  /* ------------------------------------------------------------
     AN ARCHITRAVE, NOT A BOX THROUGH THE WALL.

     This was one box per jamb and one for the head, each as deep as the
     wall was thick. Three separate depth-buffer fights came out of that,
     and together they are why every doorway in the building shimmered
     when you walked past it:

       * the box's long faces were in exactly the plane of the piers
         either side of the opening;
       * its face toward the opening was in exactly the plane of the
         pier's reveal, and its underside in the plane of the lintel's;
       * and the jambs ran up THROUGH the head, so the two overlapped in
         the corners with every face coincident.

     What is built now is what a joiner would build: a flat band on each
     face of the wall, standing a little proud of it, set back from the
     opening edge by a margin, with the jambs stopping where the head
     begins. Nothing lines the reveal, because the reveal is the end face
     of the masonry and it is already there.
     ------------------------------------------------------------ */
  const JAMB = 0.105;               // width of the band, about four inches
  const PROUD = 0.022;              // how far it stands off the wall face
  const MARGIN = 0.008;             // set-back from the opening edge

  /* `along` runs with the wall, `out` across it. A band is placed by its
     span along the wall, its height, and which face of the wall it is on. */
  const band = (a0, a1, y0, y1, side) => {
    const near = side * depth / 2;
    const far = near + side * PROUD;
    const x0 = door.x + rx * a0 + Math.abs(rz) * Math.min(near, far);
    const x1 = door.x + rx * a1 + Math.abs(rz) * Math.max(near, far);
    const z0 = door.z + rz * a0 + Math.abs(rx) * Math.min(near, far);
    const z1 = door.z + rz * a1 + Math.abs(rx) * Math.max(near, far);
    mb.box(Math.min(x0, x1), y0, Math.min(z0, z1),
      Math.max(x0, x1), y1, Math.max(z0, z1), { all: f });
  };

  const inner = hw + MARGIN;
  const outer = inner + JAMB;
  const headY = door.y + door.height + MARGIN;

  for (const side of [-1, 1]) {
    band(-outer, -inner, door.y, headY, side);            // jamb
    band(inner, outer, door.y, headY, side);              // jamb
    band(-outer, outer, headY, headY + JAMB, side);       // head, across both
  }
}
