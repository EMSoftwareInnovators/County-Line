/* ============================================================
   drivers.js -- the men who bring the coaches in.

   A DRIVER IS NOT A PASSENGER. A passenger is somebody you serve; a
   driver is somebody you work with, and the difference shows up in
   every interaction with one. They do not line up. They come in the
   side door with a manifest in their hand, they want to know whether
   there is coffee, they are gone for twenty minutes, and then they
   want their paperwork signed and their bay called. Half the job of a
   night clerk is keeping four of them moving and the other half is
   remembering which one is which.

   THE TURNAROUND, which is the only sequence in here:

     IN       walks from the coach to the side door and through to the
              break room, leaving his manifest on the board
     BREAK    sits, or stands at the coffee, or punches the clock
     BACK     walks out to the coach when his departure is called
     AT_COACH stands at the door while the manifest is signed off
     GONE     aboard, and the coach is the fleet's problem again

   Nothing in here fires on its own. The shift calls arrive() when a
   coach berths and calls() when the departure is due, and the driver
   does the walking. The player's part is the manifest and the coffee.
   ============================================================ */
import { Npc } from '../npc.js';

export const DSTATE = {
  OFF: 'off',
  IN: 'in',
  BREAK: 'break',
  BACK: 'back',
  AT_COACH: 'at-coach',
  GONE: 'gone',
};

/** What a driver does while he is off the coach, picked per man. */
const HABITS = ['coffee', 'table', 'clock'];

export class Driver {
  /** @param spec { id, name, manifest, at, skin, habit } */
  constructor(spec) {
    this.id = spec.id;
    this.name = spec.name || 'a driver';
    /** The manifest he is carrying, once there is one. */
    this.manifest = spec.manifest || null;
    this.state = DSTATE.OFF;
    this.stateT = 0;
    /** Set when he has asked for something and not got it. */
    this.asked = null;
    this.habit = spec.habit || HABITS[0];
    this.npc = new Npc({
      id: `drv:${spec.id}`,
      name: this.name,
      x: spec.at.x, y: spec.at.y || 0, z: spec.at.z,
      yaw: spec.at.yaw || 0,
      speed: 1.3,
      states: {},
    });
    this.npc.skin = spec.skin === undefined ? 0 : spec.skin;
    this.npc.owner = this;
  }

  get arrived() { return this.npc.arrived; }

  describe() {
    switch (this.state) {
      case DSTATE.IN:
        return { text: this.name, sub: 'on his way in with the manifest' };
      case DSTATE.BREAK:
        return {
          text: this.name,
          sub: this.asked ? this.asked : 'twenty minutes, then he is away again',
        };
      case DSTATE.BACK:
        return { text: this.name, sub: 'heading out to the coach' };
      case DSTATE.AT_COACH:
        return {
          text: this.name,
          sub: this.manifest && this.manifest.signed
            ? 'ready to go' : 'waiting on the manifest',
        };
      default:
        return { text: this.name, sub: '' };
    }
  }

  save() {
    return {
      id: this.id, name: this.name, s: this.state,
      m: this.manifest ? this.manifest.id : null,
      h: this.habit, a: this.asked,
      x: this.npc.x, y: this.npc.y, z: this.npc.z, yaw: this.npc.yaw,
      k: this.npc.skin,
    };
  }
}

export class CrewRoom {
  /**
   * @param level the built level -- reads marks.crew
   * @param opt   { onAsk(driver, what), onSign(driver), r }
   */
  constructor(level, opt = {}) {
    this.level = level;
    this.opt = opt;
    this.places = (level.marks && level.marks.crew) || null;
    this.drivers = [];
    this._seats = new Set();
    this.r = opt.r || Math.random;
  }

  get enabled() { return !!this.places; }
  driver(id) { return this.drivers.find((d) => d.id === id) || null; }

  /** Everybody currently in the building. */
  get present() {
    return this.drivers.filter((d) => d.state !== DSTATE.OFF && d.state !== DSTATE.GONE);
  }

  /**
   * A coach has berthed and its driver is getting off.
   * @param spec { id, name, manifest, from: {x,z} }
   */
  arrive(spec, ctx) {
    if (!this.places) return null;
    const d = new Driver({
      id: spec.id, name: spec.name, manifest: spec.manifest,
      at: { x: spec.from.x, y: spec.from.y || 0, z: spec.from.z },
      skin: Math.floor(this.r() * (this.opt.skins || 1)),
      habit: HABITS[Math.floor(this.r() * HABITS.length)],
    });
    this.drivers.push(d);
    d.state = DSTATE.IN;
    d.npc.goTo(this.places.door.x, 0, this.places.door.z, ctx);
    return d;
  }

  /** His departure has been called. Back out to the coach. */
  callOut(id, to, ctx) {
    const d = this.driver(id);
    if (!d || d.state === DSTATE.GONE) return false;
    this._release(d);
    d.state = DSTATE.BACK;
    d.stateT = 0;
    d.data = to;
    d.npc.goTo(to.x, to.y || 0, to.z, ctx);
    return true;
  }

  /** And he is away. */
  depart(id) {
    const d = this.driver(id);
    if (!d) return false;
    d.state = DSTATE.GONE;
    d.npc.hidden = true;
    this._release(d);
    return true;
  }

  _place(d) {
    const p = this.places;
    if (d.habit === 'coffee') return p.coffee;
    if (d.habit === 'clock') return p.clock;
    for (let i = 0; i < p.table.length; i++) {
      if (this._seats.has(i)) continue;
      this._seats.add(i);
      d._seat = i;
      return p.table[i];
    }
    return p.coffee;
  }

  _release(d) {
    if (d._seat !== undefined) { this._seats.delete(d._seat); d._seat = undefined; }
  }

  update(dt, ctx) {
    for (const d of this.drivers) {
      d.stateT += dt;
      switch (d.state) {
        case DSTATE.IN:
          if (d.arrived) {
            const at = this._place(d);
            d.state = DSTATE.BREAK;
            d.stateT = 0;
            d.npc.goTo(at.x, 0, at.z, ctx);
            d._facing = at.yaw;
            /* What he wants, if anything. One in three asks for
               something, and it is always small. */
            if (this.r() < 0.34) {
              d.asked = d.habit === 'coffee'
                ? 'asking whether there is any coffee made'
                : 'asking what the Atlanta is doing tonight';
              if (this.opt.onAsk) this.opt.onAsk(d, d.asked);
            }
          }
          break;
        case DSTATE.BREAK:
          if (d.arrived && d._facing !== undefined) d.npc.yaw = d._facing;
          break;
        case DSTATE.BACK:
          if (d.arrived) { d.state = DSTATE.AT_COACH; d.stateT = 0; }
          break;
        default:
          break;
      }
      d.npc.update(dt, ctx);
    }
  }

  actors() {
    const out = [];
    for (const d of this.drivers) if (!d.npc.hidden) out.push(d.npc);
    return out;
  }

  sweep() {
    const before = this.drivers.length;
    this.drivers = this.drivers.filter((d) => d.state !== DSTATE.GONE);
    return before - this.drivers.length;
  }

  save() { return { drivers: this.drivers.map((d) => d.save()) }; }

  restore(d, manifests, ctx) {
    this.drivers.length = 0;
    this._seats.clear();
    for (const r of (d && d.drivers) || []) {
      const man = manifests ? manifests.get(r.m) : null;
      const drv = new Driver({
        id: r.id, name: r.name, manifest: man || null,
        at: { x: r.x, y: r.y, z: r.z, yaw: r.yaw }, skin: r.k, habit: r.h,
      });
      drv.state = r.s;
      drv.asked = r.a || null;
      if (drv.state === DSTATE.GONE) drv.npc.hidden = true;
      this.drivers.push(drv);
      if (drv.state === DSTATE.BREAK) {
        const at = this._place(drv);
        drv.npc.goTo(at.x, 0, at.z, ctx);
      }
    }
    return true;
  }
}
