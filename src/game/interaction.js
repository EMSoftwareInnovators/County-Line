/* ============================================================
   interaction.js -- what the player is looking at, and what pressing the
   use key would do about it.

   Final Rental cast a ray at a list of tagged shapes and then ran the
   result through a 200-line switch: `case 'shelf':` ... `case 'slot':` ...
   `case 'rewinder':`, each arm assembling its own prompt string and
   closing over the game object to do the work. Every new interactable
   meant another arm, and the prompt for a thing lived a long way from the
   thing. County Line is going to have a great many more interactables
   than a video store -- a ticket window, a scale, a switchboard, a
   hundred doors -- so the branch is gone.

   AN INTERACTABLE DESCRIBES ITSELF. It offers a shape to be looked at and
   a `describe(ctx)` that returns what the prompt should say and what
   should happen. The system casts, sorts, checks the line of sight, and
   asks the winner. It never knows what any of them are.

       world.interact.add(new Interactable({
         id: 'lobby-switch',
         box: { x0, x1, y0, y1, z0, z1 },
         describe: () => ({
           text: on ? 'Turn the lights off' : 'Turn the lights on',
           action: () => toggle(),
         }),
       }));
   ============================================================ */
import { rayBox, rayCylinder } from '../engine/collision.js';

/** How far the player can reach, in meters. */
export const REACH = 2.4;

export class Interactable {
  /**
   * @param spec {
   *   id,
   *   box:  { x0,x1,y0,y1,z0,z1 }   -- or --
   *   cyl:  { x, z, r, y0, y1 },
   *   boxFn / cylFn: () => shape    for anything that moves
   *   reach:   meters, defaults to REACH
   *   priority: breaks ties when two shapes overlap; higher wins
   *   enabled: (ctx) => boolean
   *   describe: (ctx) => {
   *     text,        the line the prompt shows
   *     sub,         a quieter second line, or ''
   *     action,      () => void, or null for something you can only look at
   *     hold,        seconds the key must be held, or 0 for a tap
   *     disabled,    true to show the text but refuse the press
   *   }
   * }
   */
  constructor(spec) {
    Object.assign(this, spec);
    this.reach = spec.reach || REACH;
    this.priority = spec.priority || 0;
  }

  shape() {
    if (this.boxFn) return { box: this.boxFn() };
    if (this.cylFn) return { cyl: this.cylFn() };
    if (this.box) return { box: this.box };
    return { cyl: this.cyl };
  }

  /** Center of the shape, for the occlusion test. */
  center() {
    const s = this.shape();
    if (s.box) {
      const b = s.box;
      return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2];
    }
    const c = s.cyl;
    return [c.x, (c.y0 + c.y1) / 2, c.z];
  }
}

/** Is that solid's middle inside this box: i.e. is it the thing itself. */
function inBox(s, box) {
  if (!box) return false;
  const x = (s.x0 + s.x1) / 2, y = (s.y0 + s.y1) / 2, z = (s.z0 + s.z1) / 2;
  return x >= box.x0 - 0.02 && x <= box.x1 + 0.02
    && y >= box.y0 - 0.35 && y <= box.y1 + 0.35
    && z >= box.z0 - 0.02 && z <= box.z1 + 0.02;
}

export class InteractionSystem {
  /** @param collision a CollisionWorld, for the line-of-sight test */
  constructor(collision) {
    this.collision = collision;
    this.items = [];
    /** Set every frame by update(). */
    this.target = null;
    this.prompt = null;
    /** Seconds the use key has been held on the current target. */
    this.held = 0;
    this._lastId = null;
  }

  add(item) { this.items.push(item); return item; }
  remove(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
  }
  clear() { this.items.length = 0; this.target = null; this.prompt = null; }
  byId(id) { return this.items.find((i) => i.id === id) || null; }

  /**
   * @param eye  { x, y, z } the camera
   * @param dir  [dx, dy, dz] normalized look direction
   * @param ctx  handed to enabled() and describe()
   */
  cast(eye, dir, ctx) {
    let best = null, bestT = Infinity, bestPri = -Infinity;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.enabled && !it.enabled(ctx)) continue;
      const s = it.shape();
      let t = -1;
      if (s.box) t = rayBox(eye.x, eye.y, eye.z, dir[0], dir[1], dir[2], s.box);
      else if (s.cyl) t = rayCylinder(eye.x, eye.y, eye.z, dir[0], dir[1], dir[2], s.cyl);
      if (t < 0 || t > it.reach) continue;
      /* A closer hit wins; an equal hit goes to the higher priority. That
         is what lets a light switch sit proud of the wall it is screwed to
         without the wall's own interactable stealing the look. */
      if (t < bestT - 1e-4 || (Math.abs(t - bestT) <= 1e-4 && it.priority > bestPri)) {
        bestT = t; best = it; bestPri = it.priority;
      }
    }
    if (!best) return null;

    /* Line of sight. Final Rental did not need this -- everything in a
       video store is in the same room -- and it showed: you could shelve a
       tape through the back-room wall, which had to be patched with an
       explicit "am I in the back room" test. A ray against the collider
       costs almost nothing and is right everywhere. */
    if (this.collision) {
      const own = best.shape();
      /* LINE OF SIGHT TO THE BIT YOU ARE LOOKING AT, not to the middle
       * of the thing. Casting at the center is wrong for anything flat
       * against a wall: the middle of a three-inch-deep switch box is
       * two and a half inches off the plaster, so the sight line to it
       * runs most of the way into the wall and half a switch bank
       * stops answering. What the player is looking at is the point
       * the ray met, and that is what has to be visible. */
      const dx = dir[0], dy = dir[1], dz = dir[2];
      const len = Math.max(0.05, bestT);
      const hit = this.collision.raycast(eye.x, eye.y, eye.z, dx, dy, dz, len - 0.02);
      /* A THING CANNOT HIDE ITSELF.
       *
       * Two cases, and they are the same case. A door's own leaf is
       * between you and the door. And a station's box is drawn AROUND
       * the thing it belongs to -- the cash drawer's box is the cash
       * drawer, the vending machine's box is the vending machine -- so
       * the middle of that box is inside a solid prop and the line of
       * sight to it is blocked by the prop you are looking at.
       *
       * Twenty of the terminal's fifty-two stations failed this way,
       * and every one of them would have been "the register does not
       * work" with no further information. So a blocker whose own
       * middle lies inside the interactable's box is not a blocker. */
      if (hit && !(hit.solid.door && hit.solid.door === best.owner)
        && !inBox(hit.solid, own.box)) return null;
    }
    return best;
  }

  /** @returns { target, prompt } -- prompt is whatever describe() returned. */
  update(eye, dir, ctx, dt, useDown) {
    const hit = this.cast(eye, dir, ctx);
    this.target = hit;
    this.prompt = hit && hit.describe ? hit.describe(ctx) : null;

    if (!hit || hit.id !== this._lastId) { this.held = 0; this._lastId = hit ? hit.id : null; }
    if (hit && this.prompt && this.prompt.hold > 0 && useDown && !this.prompt.disabled) {
      this.held += dt;
    } else if (!useDown) {
      this.held = 0;
    }
    return { target: this.target, prompt: this.prompt };
  }

  /** How far through a held action we are, 0..1. */
  holdFraction() {
    if (!this.prompt || !this.prompt.hold) return 0;
    return Math.min(1, this.held / this.prompt.hold);
  }

  /**
   * Run the current target's action.
   * @param tapped  true on the frame the use key went down
   * @returns true if something happened
   */
  activate(ctx, tapped) {
    const p = this.prompt;
    if (!p || !p.action || p.disabled) return false;
    if (p.hold > 0) {
      if (this.held < p.hold) return false;
      this.held = 0;
      p.action(ctx);
      return true;
    }
    if (!tapped) return false;
    p.action(ctx);
    return true;
  }
}
