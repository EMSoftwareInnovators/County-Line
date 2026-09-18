/* ============================================================
   power.js -- the building's electricity, as the game plays it.

   electrical.js is the model: circuits, breakers, load, arithmetic. It
   has no idea what a vending machine is. This file is the half that
   knows: it turns the level's declared device list into running
   machinery, hangs the panel and the switch bank off the stations the
   level put in the clerk's office, and writes the result back onto the
   level as light.

   THE TWO THINGS THE PLAYER CAN DO, and they are deliberately
   different:

     THE SWITCH BANK, twelve labelled toggles on the north wall, turns
     the LIGHTS of a zone on and off. This is the opening and closing
     procedure: at eight you put on the zones the terminal is using and
     leave the rest dark, and at one you put them back.

     THE PANELS, three cabinets on the south wall, hold the breakers. A
     breaker cuts everything on its way, machines included, and the only
     thing a person does at a panel on an ordinary night is push a
     tripped one back up.

   There is nothing else in here. No breaker moves unless a person moves
   it or the load arithmetic in electrical.js opens it.
   ============================================================ */
import { Electrical, PoweredDevice, BREAKER } from './electrical.js';

/**
 * How long after the lights come back before a compressor restarts.
 * Real ones have a time delay so they do not stall against their own
 * head pressure; here it stops four machines coming back in step.
 */
const RESTART = 2.5;

export class Power {
  /**
   * @param level the built level, which carries the schedule
   * @param opt   { onTrip(circuit, why), toast(text) }
   */
  constructor(level, opt = {}) {
    this.level = level;
    this.system = new Electrical(level.circuits || []);
    this.clock = 0;
    this.opt = opt;
    this._devices = [];
    this._rev = -1;

    for (const spec of level.devices || []) this._add(spec);

    this.system.onTrip = (c, why) => {
      if (this.opt.onTrip) this.opt.onTrip(c, why);
    };
  }

  /* ============================================================
     DEVICES

     A device is data in the level and a closure here. Three kinds, and
     the level picks by what it writes rather than by naming a class:

       nothing extra   runs whenever it has power -- a clock, a lamp,
                       a printer idling
       duty: [on, off] cycles -- a compressor, a coffee warmer
       switched: true  runs only while somebody is running it -- the
                       conveyor motor
     ============================================================ */
  _add(spec) {
    const st = {
      id: spec.id,
      /** For a switched device: is it being run right now. */
      on: false,
      /** When it last got power, so a compressor does not restart into
          its own head pressure the instant the lights come back. */
      since: -RESTART,
      /** A fixed phase per device so four compressors do not cycle in
          step, which is the sound of a simulation rather than a
          building. */
      phase: 0,
    };
    /* A stable, spread-out phase from the id. Not random: a save that
       reloads has to sound the same. */
    let h = 0;
    for (let i = 0; i < spec.id.length; i++) h = (h * 31 + spec.id.charCodeAt(i)) & 0xffff;
    const duty = spec.duty || null;
    st.phase = duty ? (h % 1000) / 1000 * (duty[0] + duty[1]) : 0;

    const dev = new PoweredDevice({
      id: spec.id,
      circuit: spec.circuit,
      draw: spec.draw,
      label: spec.label,
      running: () => {
        if (spec.switched) return st.on;
        if (this.clock - st.since < RESTART) return false;
        if (!duty) return true;
        const period = duty[0] + duty[1];
        const t = (this.clock + st.phase) % period;
        return t < duty[0];
      },
      onPower: (live) => { if (live) st.since = this.clock; },
    });
    dev.state = st;
    dev.spec = spec;
    this.system.add(dev);
    this._devices.push(dev);
    return dev;
  }

  /** Start or stop a switched device -- the conveyor, and later others. */
  run(id, on) {
    const d = this.system.device(id);
    if (!d || !d.spec.switched) return false;
    d.state.on = !!on;
    return true;
  }

  /** Is that device switched on by its operator (whatever the power). */
  isRunning(id) {
    const d = this.system.device(id);
    return !!d && (d.spec.switched ? d.state.on : true);
  }

  /** Does that device have power AND is it doing anything. */
  working(id) {
    const d = this.system.device(id);
    return !!d && d.live && (d.spec.switched ? d.state.on : true);
  }

  /* ============================================================
     THE OPENING AND CLOSING STATE

     Eight o'clock: the terminal is open, the public rooms and the
     service rooms are lit, and the second floor is not. Nobody lights a
     floor they are not using, and the one errand up there in a whole
     shift starts with the clerk reaching for a switch.
     ============================================================ */
  openForBusiness() {
    for (const c of this.system.circuits) {
      c.switched = !c.id.startsWith('floor2');
    }
    this.system.revision++;
    return this;
  }

  /** Everything off but the outside. What the clerk does at one. */
  closeUp() {
    for (const c of this.system.circuits) {
      c.switched = c.id === 'front-ext' || c.id === 'platform';
    }
    this.system.revision++;
    return this;
  }

  /* ============================================================
     THE STATIONS
     ============================================================ */

  /**
   * Hang handlers off the stations the level declared. The level said
   * WHERE the panel and the switches are; this says what they do.
   */
  bind(level, ctx) {
    void ctx;
    for (const [id, st] of level.stations) {
      if (id.startsWith('switch.')) this._bindSwitch(st, id.slice(7));
      else if (id.startsWith('panel-')) this._bindPanel(st, id.slice(6).toUpperCase());
      else if (this._switchable(id)) this._bindMachine(st, id);
    }
    return this;
  }

  /** A station whose id is a switched device's id operates that device. */
  _switchable(id) {
    const d = this.system.device(id);
    return !!d && !!d.spec.switched;
  }

  _bindMachine(station, id) {
    const d = this.system.device(id);
    station.handler = () => {
      const on = d.state.on;
      if (!d.live) {
        return {
          text: station.name,
          sub: 'dead — no power on this way',
          action: null,
          hold: 0,
        };
      }
      return {
        text: on ? `Stop the ${station.name.toLowerCase()}` : `Start the ${station.name.toLowerCase()}`,
        sub: `${d.draw.toFixed(1)} A`,
        action: () => this.run(id, !on),
        hold: 0,
      };
    };
  }

  _bindSwitch(station, circuitId) {
    const c = this.system.circuit(circuitId);
    if (!c) return;
    station.handler = () => {
      const dead = !c.powerLive;
      return {
        text: c.switched ? `Switch off ${c.label}` : `Switch on ${c.label}`,
        /* The bank tells you what it is FOR, and the panel tells you
           why nothing happened. A switch on a dead way still clicks --
           that is what sends the player to look at the cabinets. */
        sub: dead
          ? (c.tripped ? 'no power on this way' : 'breaker off')
          : `${c.rooms.length} room${c.rooms.length === 1 ? '' : 's'}`,
        action: () => {
          this.system.toggleSwitch(circuitId);
          if (dead && this.opt.toast) {
            this.opt.toast(c.tripped
              ? `${c.label}: nothing. That way has tripped.`
              : `${c.label}: nothing. The breaker is off.`);
          }
        },
        hold: 0,
      };
    };
  }

  _bindPanel(station, panel) {
    station.handler = () => {
      const ways = this.system.panelWays(panel);
      const tripped = ways.filter((c) => c.tripped);
      const off = ways.filter((c) => c.breaker === BREAKER.OFF);
      if (tripped.length) {
        const c = tripped[0];
        return {
          text: `Reset breaker ${c.breakerNo} — ${c.label}`,
          sub: `panel ${panel}`,
          action: () => {
            this.system.reset(c.id);
            if (this.opt.toast) this.opt.toast(`${c.label} back on.`);
          },
          hold: 0.5,
        };
      }
      const state = off.length
        ? `${ways.length} ways, ${off.length} off`
        : `${ways.length} ways, all on`;
      return { text: `Panel ${panel}`, sub: state, action: null, hold: 0 };
    };
  }

  /* ============================================================
     THE LOOP
     ============================================================ */
  update(dt) {
    this.clock += dt;
    this.system.update(dt);
    if (this.system.revision !== this._rev) {
      this._rev = this.system.revision;
      this.system.applyTo(this.level);
    }
  }

  /** Force the light through, whatever the revision says. */
  apply() {
    this.system.applyTo(this.level);
    this._rev = this.system.revision;
    return this;
  }

  /* ---------------- persistence ---------------- */
  save() {
    return {
      ...this.system.save(),
      run: this._devices.filter((d) => d.state.on).map((d) => d.id),
    };
  }

  restore(data) {
    if (!data) return false;
    this.system.restore(data);
    const on = new Set(Array.isArray(data.run) ? data.run : []);
    for (const d of this._devices) d.state.on = on.has(d.id);
    this.apply();
    return true;
  }

  /* ---------------- diagnostics ---------------- */

  /** One line per circuit, for the developer overlay. Not shipped. */
  report() {
    return this.system.report().map((r) => ({
      ...r,
      devices: this._devices
        .filter((d) => d.circuit === r.id)
        .map((d) => `${d.label}${d.drawing() ? '*' : ''}`),
    }));
  }
}
