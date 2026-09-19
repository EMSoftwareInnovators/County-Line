/* ============================================================
   npc.js -- a person who is not the player.

   Final Rental's customer.js is 940 lines and every one of them is about
   renting videos: a customer arrives, joins a line, browses a genre
   shelf, hands over tapes, is charged a late fee, is served or refused,
   and leaves -- with a second 464-line personality module deciding how
   they feel about it and an appearance module deciding what a witness
   would say about them. NONE of that is County Line's, and it is the
   clearest example in the whole repository of a system that must not be
   ported wholesale.

   What is worth taking is the SHAPE. Underneath the video store, Final
   Rental's customer was a small state machine with a `state` string, a
   per-state update, a path to follow and a rig to animate. That shape is
   here, with nothing in it:

       const npc = new Npc({ x, y, z, states: { ... } });
       npc.goTo(x, y, z);
       npc.update(dt, ctx);

   A state is `{ enter?, update, exit? }`. Walking, standing and waiting
   are provided because every NPC in any game needs them; everything a
   County Line passenger or clerk actually does is a later stage's job.
   ============================================================ */
import { angleTowards, angleDelta } from '../engine/mathx.js';
import { Interactable } from './interaction.js';
import { makeAnim, updateAnim, ACTOR_HEIGHT, ACTOR_RADIUS } from './actor.js';

const ARRIVE = 0.22;      // meters from a waypoint before it counts as reached
/**
 * And how far BELOW one you may be and still have reached it.
 *
 * Arrival used to be measured in plan only, which is right for a floor
 * and wrong for anything with a rise in it. The ramp from the coach
 * yard up to the west service door climbs two foot ten in about three
 * feet, so its top and its foot are nearly the same point on a map: a
 * walker sent to the top registered as arrived while still standing at
 * the bottom, moved on to the next waypoint, and spent the rest of the
 * route pressed against the wall of a building it was standing below.
 *
 * Generous, because it only has to reject "I am on the wrong level of
 * this ramp" and never "I am on a slightly uneven floor". A walker that
 * genuinely cannot climb is caught by the stuck detector below, as
 * before.
 */
const ARRIVE_Y = 0.55;

export class Npc {
  constructor(spec = {}) {
    this.id = spec.id || 'npc';
    this.name = spec.name || 'someone';
    this.x = spec.x || 0; this.y = spec.y || 0; this.z = spec.z || 0;
    this.yaw = spec.yaw || 0;
    this.r = spec.r || ACTOR_RADIUS;
    this.height = spec.height || ACTOR_HEIGHT;
    this.step = spec.step || 0.2;
    this.vy = 0;
    this.grounded = true;
    this.speed = spec.speed || 1.25;
    this.turnRate = spec.turnRate || 5.0;
    this.anim = makeAnim();
    this.moveSpeed = 0;
    this.hidden = false;

    this.path = null;
    this.pathIndex = 0;
    this.destination = null;
    this._stuckT = 0;
    this._stuckAt = { x: this.x, z: this.z };

    this.states = spec.states || {};
    this.state = null;
    this.stateT = 0;
    this.data = spec.data || {};
    if (spec.state) this.setState(spec.state);
  }

  /* ---------------- state machine ---------------- */

  setState(name, ctx) {
    if (this.state === name) return;
    const prev = this.states[this.state];
    if (prev && prev.exit) prev.exit(this, ctx);
    this.state = name;
    this.stateT = 0;
    const next = this.states[name];
    if (next && next.enter) next.enter(this, ctx);
  }

  /* ---------------- movement ---------------- */

  /** Walk to a point, routing round geometry if a graph was supplied. */
  goTo(x, y, z, ctx) {
    this.destination = { x, y: y || 0, z };
    if (ctx && ctx.nav) {
      const reach = (ax, az, bx, bz) =>
        ctx.collision.clearPath(ax, az, bx, bz, this.y, this.r, this.height);
      this.path = ctx.nav.path(this, this.destination, reach) || [this.destination];
    } else {
      this.path = [this.destination];
    }
    this.pathIndex = 0;
    this._stuckT = 0;
    this._stuckAt = { x: this.x, z: this.z };
  }

  stop() { this.path = null; this.destination = null; this.moveSpeed = 0; }

  get arrived() { return !this.path; }

  /** Point the body at something without walking to it. */
  faceTowards(x, z, dt) {
    const want = Math.atan2(x - this.x, z - this.z);
    this.yaw = angleTowards(this.yaw, want, this.turnRate * dt);
  }

  update(dt, ctx) {
    this.stateT += dt;
    const s = this.states[this.state];
    if (s && s.update) s.update(this, dt, ctx);

    /* Give up on a waypoint nobody can reach.
     *
     * Without this, an NPC that walks into something the navigator did
     * not know about pushes against it for the rest of the session --
     * which is what "the test actor is standing in the stairwell facing a
     * wall" was. Walking somewhere is allowed to fail; standing there
     * failing forever is not. */
    if (this.path) {
      this._stuckT += dt;
      if (this._stuckT > 1.5) {
        const gone = Math.hypot(this.x - this._stuckAt.x, this.z - this._stuckAt.z);
        this._stuckT = 0;
        this._stuckAt = { x: this.x, z: this.z };
        if (gone < 0.25) {
          this.pathIndex++;
          if (this.pathIndex >= this.path.length) this.stop();
        }
      }
    }

    let moved = 0;
    if (this.path && this.pathIndex < this.path.length) {
      const wp = this.path[this.pathIndex];
      const dx = wp.x - this.x, dz = wp.z - this.z;
      const d = Math.hypot(dx, dz);
      const dy = Math.abs((wp.y === undefined ? this.y : wp.y) - this.y);
      if (d < ARRIVE && dy < ARRIVE_Y) {
        this.pathIndex++;
        if (this.pathIndex >= this.path.length) this.stop();
      } else {
        const want = Math.atan2(dx, dz);
        this.yaw = angleTowards(this.yaw, want, this.turnRate * dt);
        /* Walk in the direction the body is facing, not straight at the
           waypoint. Turning while walking is what makes a person look like
           a person rather than a sprite being dragged. */
        const align = Math.max(0, Math.cos(angleDelta(this.yaw, want)));
        const v = this.speed * align;
        const mx = Math.sin(this.yaw) * v * dt;
        const mz = Math.cos(this.yaw) * v * dt;
        if (ctx && ctx.collision) ctx.collision.move(this, mx, mz, dt);
        else { this.x += mx; this.z += mz; }
        moved = v;
      }
    } else if (ctx && ctx.collision) {
      // stand still, but stay on the floor
      ctx.collision.move(this, 0, 0, dt);
    }

    this.moveSpeed = moved;
    updateAnim(this.anim, dt, moved, this.animOpts || {});
  }

  /** The shape the interaction ray and the debug overlay use. */
  cylinder() {
    return { x: this.x, z: this.z, r: this.r + 0.18, y0: this.y + 0.05, y1: this.y + this.height + 0.25 };
  }
}

/**
 * The one behavior Stage 1 needs: walk a loop of points forever, pausing
 * at each. Enough to prove pathing, collision, stairs and animation work
 * for somebody who is not the player.
 */
export function patrol(points, pause = 1.6) {
  return {
    walk: {
      enter: (n, ctx) => {
        const p = points[n.data.at % points.length];
        n.goTo(p.x, p.y, p.z, ctx);
      },
      update: (n, dt, ctx) => {
        if (n.arrived) { n.data.at = (n.data.at + 1) % points.length; n.setState('wait', ctx); }
      },
    },
    wait: {
      update: (n, dt, ctx) => { if (n.stateT > pause) n.setState('walk', ctx); },
    },
  };
}

/**
 * The testbed's one test actor.
 *
 * A Stage 1 leftover, and deliberately kept: it is the smallest proof
 * that an NPC can be placed, pathed, collided, animated, drawn and
 * looked at, and it is the thing tools/play.mjs points at. It lives
 * here rather than in game.js because it is a fixture of a level, not a
 * feature of the game, and game.js has a terminal to run.
 *
 * @param say  what to do when somebody tries to talk to it
 * @returns the npcs to add, or [] on a level with no patrol route
 */
export function spawnTestActor(level, say) {
  const route = level.marks.patrol;
  if (!route) return [];
  const npc = new Npc({
    id: 'test-actor', name: 'test actor',
    x: route[0].x, y: route[0].y, z: route[0].z,
    states: patrol(route, 1.4),
    state: 'walk',
    data: { at: 0 },
  });
  level.interact.add(new Interactable({
    id: 'npc:test-actor',
    cylFn: () => npc.cylinder(),
    describe: () => ({
      text: 'Get their attention',
      sub: 'test actor',
      action: () => say('The test actor does not react. Nothing here talks yet.'),
      hold: 0,
    }),
  }));
  return [npc];
}
