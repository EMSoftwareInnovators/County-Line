/* ============================================================
   fleet.js -- the coaches, and how one arrives.

   ONE MESH, MANY BUSES. buildCoachMesh is called once at level load and
   every coach in the yard is that mesh with a matrix. Four of them at
   the platform cost four draw calls. The destination roll over the
   windshield is its own little mesh per destination, cached, because
   two coaches at the same platform with the same sign on the front is
   the detail nobody misses.

   THE STATES a coach goes through, and what each one means for the
   player:

     SCHEDULED    not here. Nothing drawn, nothing in the way.
     APPROACHING  in the aisle, coming down the yard from the north.
                  You can see it out of the west windows before you
                  hear it.
     ARRIVING     swinging out of the aisle and nosing into its berth.
     AT_BAY       standing. Its front door is shut, the driver is
                  walking to the break room, and it is EIGHT AND A HALF
                  FEET OF SOLID in the middle of the platform -- which
                  is the whole reason this file puts colliders on the
                  level rather than just drawing.
     BOARDING     door open, passengers walking on.
     DEPARTING    backing out of the berth and away south.
     GONE         off the site. Removed from the fleet.

   Nothing here decides WHEN. The schedule does that, and calls arrive()
   and depart(). This file only knows how a bus gets from the gate to
   berth three without driving through the building.
   ============================================================ */
import { buildCoachMesh, buildRollMesh, COACH } from '../../world/levels/academy/terminal/coach.js';
import { mat, setPosYaw } from '../../engine/mathx.js';

export const COACH_STATE = {
  SCHEDULED: 'scheduled',
  APPROACHING: 'approaching',
  ARRIVING: 'arriving',
  AT_BAY: 'at-bay',
  BOARDING: 'boarding',
  DEPARTING: 'departing',
  GONE: 'gone',
};

/** Yard speeds, in meters a second. A coach in a yard crawls. */
const SPEED = { aisle: 4.0, turn: 1.6, back: 1.2 };

/**
 * Compass bearings as this engine's yaw.
 *
 * forwardOf() in player.js is (sin yaw, ., cos yaw), so yaw zero is
 * north, a QUARTER TURN POSITIVE IS EAST, and south is a half turn. A
 * coach coming down the aisle is on SOUTH and a coach in its berth is
 * on EAST, so the whole arrival is one monotonic quarter turn and there
 * is no wrap to get wrong.
 */
const SOUTH = Math.PI;
const EAST = Math.PI / 2;

export class Coach {
  /**
   * @param spec {
   *   id, route, sign,   what is painted on the roll
   *   bay,               the berth record from level.marks.yard
   *   yard,              the whole yard record
   * }
   */
  constructor(spec) {
    this.id = spec.id;
    this.route = spec.route || null;
    this.sign = spec.sign || '';
    this.bay = spec.bay;
    this.yard = spec.yard;
    this.state = COACH_STATE.SCHEDULED;
    /* Where it is. The origin is the middle of the rear axle on the
       ground, which is what coach.js builds around. */
    this.x = spec.yard.entry.x;
    this.y = spec.yard.grade;
    this.z = spec.yard.entry.z;
    this.yaw = SOUTH;
    this._m = mat();
    this._dirty = true;
    /** Set when a state finishes, so the shift can wait on it. */
    this.settled = false;
  }

  /* ---------------- geometry ---------------- */

  matrix() {
    if (this._dirty) {
      /* Local +Z is the nose, which is the same convention a door leaf
         and an actor use, so the engine's own helper places it. */
      setPosYaw(this._m, this.x, this.y, this.z, this.yaw);
      this._dirty = false;
    }
    return this._m;
  }

  /** Is any of it on the site at all. */
  get present() {
    return this.state !== COACH_STATE.SCHEDULED && this.state !== COACH_STATE.GONE;
  }

  /**
   * The box it blocks, in world axes.
   *
   * A coach is either nose-east in a berth or nose-south in the aisle,
   * so the footprint is axis-aligned either way and one box does it.
   * A coach halfway through its turn is approximated by the union,
   * which is generous by a few feet for four seconds in a yard nobody
   * is standing in.
   */
  footprint() {
    const halfW = COACH.width / 2;
    const alongX = Math.abs(Math.cos(this.yaw)) < 0.5;
    const ahead = COACH.nose, behind = COACH.tail;
    /* Which way the nose points along the axis it is on. Local +Z is
       the nose and setRotY sends it to (sin yaw, ., cos yaw). */
    const f = (alongX ? Math.sin(this.yaw) : Math.cos(this.yaw)) >= 0 ? 1 : -1;
    if (alongX) {
      return {
        x0: this.x - (f > 0 ? behind : ahead), x1: this.x + (f > 0 ? ahead : behind),
        z0: this.z - halfW, z1: this.z + halfW,
        y0: this.y, y1: this.y + COACH.height,
      };
    }
    return {
      x0: this.x - halfW, x1: this.x + halfW,
      z0: this.z - (f > 0 ? behind : ahead), z1: this.z + (f > 0 ? ahead : behind),
      y0: this.y, y1: this.y + COACH.height,
    };
  }

  contributeSolids(out) {
    if (!this.present) return;
    const b = this.footprint();
    out.push({
      x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, z0: b.z0, z1: b.z1,
      tag: 'coach', walkable: false, coach: this,
    });
  }

  /**
   * Where a passenger stands to get on.
   *
   * The door is on the coach's LEFT -- local -X, twenty-four feet
   * forward of the rear axle -- which for a coach nosed east means the
   * north side of the berth, out on the asphalt beside it. That is
   * where the door on a real one is and it is why the yard is all one
   * level.
   */
  doorPoint() {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    /* The door is on the coach's left side, `doorAt` forward of the
       origin. Local (-halfW - 2ft, doorAt) into world. */
    const lx = -(COACH.width / 2 + 0.6), lz = COACH.doorAt;
    return { x: this.x + lx * c + lz * s, z: this.z - lx * s + lz * c };
  }

  /* ---------------- moving ---------------- */

  /** Crawl toward a point, returning true when it is reached. */
  _driveTo(x, z, speed, dt) {
    const dx = x - this.x, dz = z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { this.x = x; this.z = z; this._dirty = true; return true; }
    const step = Math.min(d, speed * dt);
    this.x += (dx / d) * step;
    this.z += (dz / d) * step;
    this._dirty = true;
    return false;
  }

  /** Swing the nose toward a bearing, returning true when it is there. */
  _turnTo(yaw, dt) {
    const rate = 0.55;                   // radians a second: slow, like a bus
    const d = yaw - this.yaw;
    if (Math.abs(d) < 0.01) { this.yaw = yaw; this._dirty = true; return true; }
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    this._dirty = true;
    return false;
  }

  /* ---------------- the state machine ---------------- */

  arrive() {
    if (this.state !== COACH_STATE.SCHEDULED) return false;
    this.x = this.yard.entry.x;
    this.z = this.yard.entry.z;
    this.yaw = SOUTH;
    this.state = COACH_STATE.APPROACHING;
    this.settled = false;
    this._dirty = true;
    return true;
  }

  board(on) {
    if (this.state === COACH_STATE.AT_BAY && on) this.state = COACH_STATE.BOARDING;
    else if (this.state === COACH_STATE.BOARDING && !on) this.state = COACH_STATE.AT_BAY;
    else return false;
    return true;
  }

  depart() {
    if (this.state !== COACH_STATE.AT_BAY && this.state !== COACH_STATE.BOARDING) return false;
    this.state = COACH_STATE.DEPARTING;
    this.settled = false;
    return true;
  }

  update(dt) {
    const bay = this.bay;
    switch (this.state) {
      case COACH_STATE.APPROACHING:
        /* Down the aisle to the line of its own berth, and then stop
           dead for a second before the turn -- which is what a driver
           does, and what makes the arrival readable from inside. */
        if (this._driveTo(this.yard.aisleX, bay.z, SPEED.aisle, dt)) {
          this.state = COACH_STATE.ARRIVING;
        }
        break;
      case COACH_STATE.ARRIVING: {
        const turned = this._turnTo(bay.yaw, dt);
        /* Creep forward while turning, the way a bus swings in. */
        if (turned) {
          if (this._driveTo(bay.x, bay.z, SPEED.turn, dt)) {
            this.state = COACH_STATE.AT_BAY;
            this.settled = true;
          }
        } else {
          this._driveTo(this.yard.aisleX + 3, bay.z, SPEED.turn, dt);
        }
        break;
      }
      case COACH_STATE.DEPARTING:
        /* Back out to the aisle, straighten, and away south. */
        if (Math.abs(this.x - this.yard.aisleX) > 0.1) {
          this._driveTo(this.yard.aisleX, bay.z, SPEED.back, dt);
        } else if (!this._turnTo(SOUTH, dt)) {
          /* still straightening */
        } else if (this._driveTo(this.yard.exit.x, this.yard.exit.z, SPEED.aisle, dt)) {
          this.state = COACH_STATE.GONE;
          this.settled = true;
        }
        break;
      default:
        break;
    }
  }
}

export class Fleet {
  /**
   * @param materials the material set
   * @param level     the built level; reads marks.yard
   */
  constructor(materials, level) {
    this.level = level;
    this.yard = (level.marks && level.marks.yard) || null;
    this.coaches = [];
    this._rolls = new Map();
    this.mesh = this.yard ? buildCoachMesh(materials) : null;
    this.materials = materials;
    if (this.yard) level.movers.push(this);
  }

  get enabled() { return !!this.yard; }

  bay(id) {
    if (!this.yard) return null;
    return this.yard.bays.find((b) => b.id === id) || null;
  }

  /** A free berth, or null if the yard is full. */
  freeBay() {
    if (!this.yard) return null;
    const taken = new Set(this.coaches.filter((c) => c.present).map((c) => c.bay.id));
    return this.yard.bays.find((b) => !taken.has(b.id)) || null;
  }

  /** @param spec { id, route, sign, bay } -- bay is a number or omitted */
  add(spec) {
    if (!this.yard) return null;
    const bay = spec.bay ? this.bay(spec.bay) : this.freeBay();
    if (!bay) return null;
    const c = new Coach({ ...spec, bay, yard: this.yard });
    this.coaches.push(c);
    /* Its mesh instance, and the roll over its windshield. Both carry
       the coach they belong to, so sweeping the fleet after a departure
       takes the draw calls with it. */
    this.level.dynamic.push({
      coach: c, mesh: this.mesh,
      matrix: () => (c.present ? c.matrix() : null),
      chunk: 'academy.grounds.west',
    });
    if (c.sign) {
      this.level.dynamic.push({
        coach: c, mesh: this.roll(c.sign),
        matrix: () => (c.present ? c.matrix() : null),
        chunk: 'academy.grounds.west',
      });
    }
    return c;
  }

  /** One mesh per destination, built once and shared. */
  roll(text) {
    let m = this._rolls.get(text);
    if (!m) { m = buildRollMesh(this.materials, text); this._rolls.set(text, m); }
    return m;
  }

  coach(id) { return this.coaches.find((c) => c.id === id) || null; }

  /**
   * Wind a new destination onto the roll.
   *
   * A coach that comes in as the Macon and goes back out as the
   * Charleston is the SAME BUS, and the only thing about it that
   * changes is the sign on the front. So the roll's mesh instance is
   * swapped and nothing else moves.
   */
  resign(c, text) {
    if (!c || !text) return false;
    c.sign = text;
    const mesh = this.roll(text);
    let found = false;
    for (const d of this.level.dynamic) {
      if (d.coach !== c || d.mesh === this.mesh) continue;
      d.mesh = mesh;
      found = true;
    }
    if (!found) {
      this.level.dynamic.push({
        coach: c, mesh,
        matrix: () => (c.present ? c.matrix() : null),
        chunk: 'academy.grounds.west',
      });
    }
    return true;
  }

  /** Whatever is standing at that berth, or null. */
  atBay(id) {
    return this.coaches.find((c) => c.present && c.bay.id === id
      && (c.state === COACH_STATE.AT_BAY || c.state === COACH_STATE.BOARDING)) || null;
  }

  update(dt) {
    for (const c of this.coaches) c.update(dt);
  }

  contributeSolids(out) {
    for (const c of this.coaches) c.contributeSolids(out);
  }

  /** Forget the ones that have left, so the fleet does not grow all night. */
  sweep() {
    const before = this.coaches.length;
    const gone = new Set(this.coaches.filter((c) => c.state === COACH_STATE.GONE));
    if (!gone.size) return 0;
    this.coaches = this.coaches.filter((c) => !gone.has(c));
    this.level.dynamic = this.level.dynamic.filter((d) => !gone.has(d.coach));
    return before - this.coaches.length;
  }

  save() {
    return this.coaches.filter((c) => c.present).map((c) => ({
      id: c.id, route: c.route, sign: c.sign, bay: c.bay.id,
      state: c.state, x: c.x, z: c.z, yaw: c.yaw,
    }));
  }

  restore(rows) {
    this.coaches.length = 0;
    /* The mesh instances in level.dynamic close over the coach they were
       made for, so a restore rebuilds them rather than reusing. */
    this.level.dynamic = this.level.dynamic.filter((d) => !d.coach);
    for (const r of Array.isArray(rows) ? rows : []) {
      const c = this.add({ id: r.id, route: r.route, sign: r.sign, bay: r.bay });
      if (!c) continue;
      c.state = r.state;
      c.x = r.x; c.z = r.z; c.yaw = r.yaw;
      c._dirty = true;
    }
    return this;
  }

}
