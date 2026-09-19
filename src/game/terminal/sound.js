/* ============================================================
   sound.js -- what the building sounds like while it is working.

   FOUR LOOPS THAT COME AND GO WITH THE MACHINERY THAT MAKES THEM. A
   coach idling at a bay, the belt in the dispatch room, a compressor
   in a vending machine: each one is an emitter that exists exactly
   while the thing exists and is running, so pulling the east wing's
   breaker stops the belt and you hear it stop. Nothing here is a
   soundtrack; every noise has a machine behind it that the player can
   walk up to.

   AND ONE ONE-SHOT THAT IS DELIBERATELY NOTHING. The brief asks for
   old-building noises that are not framed as anything, and the way to
   not frame something is to give it no trigger, no cue and no
   reaction: a joist moves every couple of minutes, indoors, wherever
   you happen to be. It does not happen more when you are alone. It
   does not happen upstairs. It is a hundred and ninety-six year old
   building with the heat off, and that is the whole of it.
   ============================================================ */

/** Where the belt is, in the dispatch room. See terminal/staff.js. */
const BELT = { x: 10.72, y: 0.8, z: 4.72 };

export class TerminalSound {
  constructor() {
    /** coach id -> emitter */
    this.coaches = new Map();
    this.belt = null;
    /** machine id -> emitter, for the compressors */
    this.machines = new Map();
    this.settle = 40 + Math.random() * 60;
  }

  /** @param g the Game */
  update(dt, g) {
    if (!g.audio.ready) return;

    /* a coach standing at a bay, running */
    for (const c of g.fleet.coaches) {
      const e = this.coaches.get(c.id);
      if (c.present && !e) {
        this.coaches.set(c.id, g.sfx.dieselIdle(c.x, c.y + 1.2, c.z));
        g.sfx.coachAir(g.audio.spatial(c.x, c.y + 1, c.z, 40).pan);
      } else if (c.present && e) {
        e.moveTo(c.x, c.y + 1.2, c.z);
      } else if (!c.present && e) {
        e.stop();
        this.coaches.delete(c.id);
      }
    }
    /* and anything that has left is no longer a coach at all */
    for (const [id, e] of [...this.coaches]) {
      if (!g.fleet.coach(id)) { e.stop(); this.coaches.delete(id); }
    }

    /* the belt, while it is actually turning -- which means while it
       has power AND somebody is running it */
    const belt = g.power && g.power.working('conveyor');
    if (belt && !this.belt) this.belt = g.sfx.conveyorRun(BELT.x, BELT.y, BELT.z);
    else if (!belt && this.belt) { this.belt.stop(); this.belt = null; }

    /* the compressors, which are on the same breakers as everything
       else and stop with them */
    if (g.power) {
      for (const d of g.power.system.devices) {
        if (!d.spec.duty) continue;
        const on = d.drawing();
        const e = this.machines.get(d.id);
        if (on && !e) {
          const at = this._where(g, d.id);
          if (at) this.machines.set(d.id, g.sfx.compressor(at.x, at.y, at.z));
        } else if (!on && e) { e.stop(); this.machines.delete(d.id); }
      }
    }

    /* THE HUMS GO OUT WITH THE LIGHTS. Every fluorescent emitter in
       the level belongs to a room, and a room's brightness is what
       its breaker wrote onto chunkLit -- so pulling the east wing
       leaves the baggage room dark AND silent, and you hear it go. */
    if (g.power) {
      for (const e of g._emitters) {
        if (!e.room) continue;
        const lit = g.level.chunkLit[e.room];
        if (lit === undefined) continue;
        if (e._baseGain === undefined) e._baseGain = e.gain;
        e.gain = e._baseGain * lit;
      }
    }

    /* and the building, about nothing */
    this.settle -= dt;
    if (this.settle <= 0) {
      this.settle = 70 + Math.random() * 90;
      const room = g.level.roomAt(g.player.x, g.player.y, g.player.z);
      if (room && !room.outdoor) g.sfx.settle((Math.random() - 0.5) * 1.4);
    }
  }

  /** A vending machine's station box is where the machine is. */
  _where(g, id) {
    const st = g.level.stations.get(id);
    const b = st && st.box;
    if (!b) return null;
    return { x: (b.x0 + b.x1) / 2, y: b.y0 + 0.5, z: (b.z0 + b.z1) / 2 };
  }

  stop() {
    for (const e of this.coaches.values()) e.stop();
    for (const e of this.machines.values()) e.stop();
    if (this.belt) this.belt.stop();
    this.coaches.clear();
    this.machines.clear();
    this.belt = null;
  }
}
