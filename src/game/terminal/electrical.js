/* ============================================================
   electrical.js -- circuits, breakers, and everything plugged into them.

   The Old Academy was finished in 1802. Its electrical supply is a
   retrofit, all of it on the surface of the plaster, all of it fed from
   three cabinets on one wall of the room the museum called the Docent
   Library. That is a building fact, it is canonical, and it is the
   reason the night clerk's desk is in that room.

   ------------------------------------------------------------
   WHAT A CIRCUIT IS

   Two switches in series, which is how a real building works and which
   the game needs to be two different things:

       BREAKER   on / off / tripped.  In the cabinet. Cuts EVERYTHING,
                 lights and equipment alike. Only a trip puts it in the
                 third state, and only a person standing at the panel can
                 clear it.
       SWITCH    on / off.  On the labelled bank beside the cabinets.
                 Cuts the LIGHTS on that circuit and nothing else.

   So `lightsLive` needs both and `powerLive` needs only the breaker.
   That split is what makes the opening procedure mean something -- the
   clerk switches on the zones the terminal is using tonight and leaves
   the rest dark, without unplugging the ticket printer -- and it is what
   makes a trip different from a switch: a trip takes the vending machine
   with it.

   ------------------------------------------------------------
   POWERED DEVICES ARE NOT SPECIAL CASES

   A device names a circuit and says what it draws. It does not know
   which circuit that is and nothing here knows what the device is. There
   is no `if (circuit === 'east-rear') stopThePrinter()` anywhere, because
   the moment there is one there are forty, each in a different file, and
   the electrical system becomes a list of the things that happened to be
   plugged in the week it was written.

   ------------------------------------------------------------
   AND WHY IT TRIPS

   Load. Each circuit has a rating in amps and each running device a
   draw. Hold a circuit over its rating for `GRACE` seconds and the
   breaker goes. The east wing is the one that does it, because the east
   wing has the baggage scale, the conveyor and a vending machine from
   1974 whose compressor cycles, and the sum of those three is four amps
   over what a 1950s panel way was ever meant to carry.

   That is the whole mechanic. There is nothing supernatural in this file
   and nothing in it flips a breaker except arithmetic.
   ============================================================ */

export const BREAKER = { ON: 'on', OFF: 'off', TRIPPED: 'tripped' };

/** Seconds a circuit may sit over its rating before the breaker goes. */
export const GRACE = 12;

/* How dark a room goes when its lights are not live. Not zero: a room in
   a working building at night has a doorway and a window in it, and the
   second baked shade term is what that looks like. */
const DIM = 0;

export class Circuit {
  constructor(def) {
    this.id = def.id;
    this.label = def.label;
    this.panel = def.panel;
    this.breakerNo = def.breaker;
    this.rooms = def.rooms ? def.rooms.slice() : [];
    /** Amps this way is good for. */
    this.rating = def.rating === undefined ? 15 : def.rating;
    this.breaker = BREAKER.ON;
    this.switched = false;
    /** Seconds spent over the rating, so a brief surge is not a trip. */
    this.over = 0;
  }

  /** The lights on this circuit are burning. */
  get lightsLive() { return this.breaker === BREAKER.ON && this.switched; }
  /** Anything plugged into it has power, switch or no switch. */
  get powerLive() { return this.breaker === BREAKER.ON; }
  get tripped() { return this.breaker === BREAKER.TRIPPED; }

  /** What the panel card reads as. */
  get stateText() {
    if (this.breaker === BREAKER.TRIPPED) return 'TRIPPED';
    if (this.breaker === BREAKER.OFF) return 'OFF';
    return this.switched ? 'ON' : 'ON (switched off)';
  }
}

/**
 * Something that needs power.
 *
 * @param spec {
 *   id, circuit,
 *   draw,        amps while running; 0 for anything that only needs to
 *                be live, like a lamp in a fitting
 *   running,     () => boolean -- is it drawing right now? Defaults to
 *                "yes, whenever it has power"
 *   onPower,     (live) => void, called when that changes
 *   label,       for the diagnostics overlay
 * }
 */
export class PoweredDevice {
  constructor(spec) {
    this.id = spec.id;
    this.circuit = spec.circuit;
    this.draw = spec.draw === undefined ? 0 : spec.draw;
    this.label = spec.label || spec.id;
    this._running = spec.running || null;
    this.onPower = spec.onPower || null;
    /** Set by the system every update. */
    this.live = false;
  }

  /** Drawing current right now. Nothing draws without power. */
  drawing() {
    if (!this.live) return false;
    return this._running ? !!this._running() : true;
  }
}

export class Electrical {
  /** @param defs the circuit schedule -- see the academy's fixtures.js */
  constructor(defs) {
    this.circuits = defs.map((d) => new Circuit(d));
    this.byId = new Map(this.circuits.map((c) => [c.id, c]));
    this.devices = [];
    this.devicesById = new Map();
    /** Room id -> circuit id, built from the schedule. */
    this.roomCircuit = new Map();
    for (const c of this.circuits) for (const r of c.rooms) this.roomCircuit.set(r, c.id);
    /** [{ circuit, at }] -- what tripped and when, for the shift log. */
    this.trips = [];
    /** Bumped whenever anything changes, so the level is only redressed
        when it has to be. */
    this.revision = 0;
    /** Set by the owner to be told about a trip. */
    this.onTrip = null;
  }

  circuit(id) { return this.byId.get(id) || null; }

  /** Circuits in panel order, for a cabinet's own list. */
  panelWays(panel) {
    return this.circuits.filter((c) => c.panel === panel)
      .sort((a, b) => a.breakerNo - b.breakerNo);
  }

  get panels() {
    const seen = [];
    for (const c of this.circuits) if (!seen.includes(c.panel)) seen.push(c.panel);
    return seen;
  }

  /* ---------------- devices ---------------- */

  add(device) {
    const d = device instanceof PoweredDevice ? device : new PoweredDevice(device);
    if (!this.byId.has(d.circuit)) throw new Error(`device ${d.id}: no circuit ${d.circuit}`);
    this.devices.push(d);
    this.devicesById.set(d.id, d);
    d.live = this.circuit(d.circuit).powerLive;
    this.revision++;
    return d;
  }

  device(id) { return this.devicesById.get(id) || null; }

  /** True if that device has power. Unknown devices are dead, not live. */
  powered(id) {
    const d = this.devicesById.get(id);
    return !!d && d.live;
  }

  /* ---------------- the panel and the switch bank ---------------- */

  /** Throw a breaker. A tripped way cannot be switched, only reset. */
  setBreaker(id, on) {
    const c = this.circuit(id);
    if (!c || c.tripped) return false;
    c.breaker = on ? BREAKER.ON : BREAKER.OFF;
    if (!on) c.over = 0;
    this.revision++;
    return true;
  }

  /** Clear a trip. This is the thing the player walks to the library for. */
  reset(id) {
    const c = this.circuit(id);
    if (!c || !c.tripped) return false;
    c.breaker = BREAKER.ON;
    c.over = 0;
    this.revision++;
    return true;
  }

  /** Flip a light switch on the bank. Works whatever the breaker says --
      you can switch a dead circuit on and get nothing, which is exactly
      what sends the player to look at the panel. */
  setSwitch(id, on) {
    const c = this.circuit(id);
    if (!c) return false;
    c.switched = !!on;
    this.revision++;
    return true;
  }

  toggleSwitch(id) {
    const c = this.circuit(id);
    return c ? this.setSwitch(id, !c.switched) : false;
  }

  /** Force a way open. `why` goes in the log; there is no ghost in it. */
  trip(id, why = 'overload') {
    const c = this.circuit(id);
    if (!c || c.tripped) return false;
    c.breaker = BREAKER.TRIPPED;
    c.over = 0;
    this.trips.push({ circuit: id, why });
    this.revision++;
    if (this.onTrip) this.onTrip(c, why);
    return true;
  }

  /* ---------------- load ---------------- */

  /** Amps on a circuit right now. */
  loadOn(id) {
    let a = 0;
    for (const d of this.devices) if (d.circuit === id && d.drawing()) a += d.draw;
    return a;
  }

  /**
   * Push power out to the devices, and trip anything held over its
   * rating for long enough.
   */
  update(dt) {
    for (const d of this.devices) {
      const live = this.circuit(d.circuit).powerLive;
      if (live !== d.live) {
        d.live = live;
        if (d.onPower) d.onPower(live);
      }
    }
    for (const c of this.circuits) {
      if (!c.powerLive) { c.over = 0; continue; }
      const a = this.loadOn(c.id);
      if (a > c.rating) {
        c.over += dt;
        if (c.over >= GRACE) this.trip(c.id, 'overload');
      } else if (c.over > 0) {
        /* Recovers twice as fast as it heats up, which is roughly how a
           thermal-magnetic breaker behaves and, more to the point, means
           a player who unplugs something has visibly fixed it. */
        c.over = Math.max(0, c.over - dt * 2);
      }
    }
  }

  /* ---------------- the building ---------------- */

  /**
   * Write the circuit states onto the level as per-chunk light blends.
   *
   * This is the whole connection between the panel and what the player
   * sees: `chunkLit` is the blend between each vertex's two baked shade
   * terms, so a circuit going out is one number per room.
   */
  applyTo(level) {
    for (const c of this.circuits) {
      const v = c.lightsLive ? 1 : DIM;
      for (const r of c.rooms) level.chunkLit[r] = v;
    }
    return this;
  }

  /** Which circuit lights the room the player is standing in, or null. */
  circuitForRoom(roomId) {
    const id = this.roomCircuit.get(roomId);
    return id ? this.circuit(id) : null;
  }

  /* ---------------- persistence ---------------- */

  save() {
    return {
      c: this.circuits.map((c) => [c.id, c.breaker, c.switched ? 1 : 0]),
      trips: this.trips.slice(-16),
    };
  }

  restore(data) {
    if (!data || !Array.isArray(data.c)) return false;
    for (const [id, breaker, sw] of data.c) {
      const c = this.circuit(id);
      if (!c) continue;
      c.breaker = [BREAKER.ON, BREAKER.OFF, BREAKER.TRIPPED].includes(breaker)
        ? breaker : BREAKER.ON;
      c.switched = !!sw;
      c.over = 0;
    }
    this.trips = Array.isArray(data.trips) ? data.trips.slice(-16) : [];
    this.revision++;
    return true;
  }

  /** Everything at once, for the opening and closing procedures. */
  allSwitches(on) {
    for (const c of this.circuits) c.switched = !!on;
    this.revision++;
    return this;
  }

  /** A summary line per circuit, for the developer overlay. */
  report() {
    return this.circuits.map((c) => ({
      id: c.id, label: c.label, panel: c.panel, breaker: c.breakerNo,
      state: c.stateText, load: this.loadOn(c.id), rating: c.rating,
      over: Math.round(c.over * 10) / 10,
    }));
  }
}
