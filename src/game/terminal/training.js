/* ============================================================
   training.js -- the shift before the shift.

   ------------------------------------------------------------
   IT TEACHES THE REAL THING, NOT A MODEL OF IT.

   The temptation with a tutorial level is to build a small imitation of
   the job: a pretend counter, a pretend sale, a script that nods along.
   Everything in here is the actual system instead. The sale is a real
   Sale out of service.js; the money is a real Drawer with a real float
   in it; the ticket comes off a real TicketBook and carries a real
   serial; the box the player chooses lines out of is the same
   ui/dialogue.js they will use all night. Nothing is simulated except
   the passenger, who is one person instead of forty.

   The consequence that matters: a player who has finished this has not
   been SHOWN how to sell a ticket, they have sold one.

   WHAT IT IS NOT. It is not the shift. There is no clock, no coaches,
   no breakers, no incidents and nothing to be late for, because the
   point of the training room is that nothing is happening in it.
   Punching out on the clock by the door is the last step, and that is
   what loads Richmond Central.
   ------------------------------------------------------------
 */
import { Npc } from '../npc.js';
import { Sale, STEP } from './service.js';
import { Drawer, OPENING_FLOAT, money } from './money.js';
import { TicketBook } from './tickets.js';
import { conversation } from './counter.js';
import { ROUTE_BY_ID, fareFor } from './routes.js';

/** Who comes in to be sold a ticket. One person, every time. */
const TRAINEE = {
  who: 'the man from the garage',
  says: 'Atlanta, one way. And I have got the one case.',
  want: 'ticket',
  route: 'atl',
  to: 'Atlanta',
  cls: 'adult',
  roundTrip: false,
  bags: [34],
  /* He pays with two twenties, which is the ordinary case: more than
     the fare, and change to count back. */
  paid: 4000,
};

/* ============================================================
   THE STEPS

   Each one names a place, says what to do there in the words somebody
   would use, and knows when it has been done. `done` is asked every
   frame and is the only thing that advances the lesson -- there is no
   scripted timing anywhere in here, so a player who wanders off and
   comes back an hour later is on the same step they left on.
   ============================================================ */
export const STEPS = [
  {
    id: 'walk',
    objective: 'Walk to the counter',
    say: [
      'Richmond Central puts new clerks in here before it puts them behind a window.',
      'Move with the movement keys, look with the mouse. Get yourself over to the counter.',
    ],
    done: (t) => t.nearStation('ticket-counter', 2.6),
  },
  {
    id: 'lights',
    objective: 'Put the light on, by the door',
    say: [
      'Light first. The switch is by the door you came in.',
      'Look at it and HOLD the use key — anything worth doing twice is a hold, so you cannot do it by accident.',
    ],
    done: (t) => t.flags.has('lights'),
  },
  {
    id: 'card',
    objective: 'Read the fare card behind the counter',
    say: [
      'Fares are on the card on the wall. You read them off it. You do not guess and you do not round.',
      'Look at it and tap the use key.',
    ],
    done: (t) => t.flags.has('card'),
  },
  {
    id: 'serve',
    objective: 'Serve the man at the window',
    say: [
      'Here he is. Stand at the window and press use to open him up.',
      'You get a box with what he said and what you can say back. Arrows to choose, use to say it.',
      'Quote him the fare.',
    ],
    done: (t) => t.sale && t.sale.step !== STEP.IDLE && t.sale.step !== STEP.ASKED,
  },
  {
    id: 'take',
    objective: 'Take his money at the register',
    say: [
      'He is holding two twenties. Money happens AT THE REGISTER, not at the window — that is the whole shape of this counter.',
      'Step along to it and take what he is holding.',
    ],
    done: (t) => t.sale && (t.sale.step === STEP.PAID || t.sale.step === STEP.CHANGED
      || t.sale.step === STEP.PRINTED || t.flags.has('done')),
  },
  {
    id: 'change',
    objective: 'Count out his change',
    say: [
      'Now count it back out of the drawer. The drawer has a float in it and the float has to square at the end of a night.',
    ],
    done: (t) => t.sale && (t.sale.step === STEP.CHANGED || t.sale.step === STEP.PRINTED
      || t.flags.has('done')),
  },
  {
    id: 'print',
    objective: 'Print the ticket',
    say: ['Printer is the other end of the counter. Put it on the roll.'],
    done: (t) => t.sale && (t.sale.step === STEP.PRINTED || t.flags.has('done')),
  },
  {
    id: 'hand',
    objective: 'Hand it over at the window',
    say: ['Back to the window and give it to him. That is a sale.'],
    done: (t) => t.flags.has('done'),
  },
  {
    id: 'weigh',
    objective: 'Weigh his case on the scale',
    say: [
      'His case. Two free, three dollars after that, five if it is over fifty pounds — which is what the scale is for.',
      'It is in the corner. Put the case on it.',
    ],
    done: (t) => t.flags.has('weigh'),
  },
  {
    id: 'tag',
    objective: 'Tag the case at the tag desk',
    say: [
      'Every bag gets a tag and he keeps the claim number. No number, no bag — that is not a guideline.',
    ],
    done: (t) => t.flags.has('tag'),
  },
  {
    id: 'board',
    objective: 'Put a departure up on the board',
    say: [
      'Last thing in here. Passengers read the board before they read you, so it says what is actually running.',
    ],
    done: (t) => t.flags.has('board'),
  },
  {
    id: 'out',
    objective: 'Punch out and get over to Richmond Central',
    say: [
      'That is the job. Sell the ticket, take the money, tag the bag, keep the board honest.',
      'Punch out on the clock by the door. You are on at eight at Richmond Central.',
    ],
    done: (t) => t.flags.has('out'),
  },
];

const LINE_TIME = 4.0;

export class Training {
  /**
   * @param deps { toast(text, kind), speak(who, line), talk(), onFinish() }
   */
  constructor(deps = {}) {
    this.d = deps;
    this.at = 0;
    this.line = 0;
    this.t = LINE_TIME;
    this.flags = new Set();
    this.npc = null;
    this.sale = null;
    this.drawer = new Drawer(OPENING_FLOAT);
    this.book = new TicketBook();
    this.level = null;
    this.done = false;
  }

  get running() { return !this.done; }
  get step() { return STEPS[this.at] || null; }

  /* ---- the shim the dialogue box talks to ----
     conversation() wants a Shift. It touches six things on one, and
     these are the six: who is at the window, the sale, a way to log, a
     way to toast, a way to clear the window, and the drawer. Writing
     them out is shorter and clearer than giving the training room a
     whole Shift it has no use for. */
  get crowd() { return { atWindow: this.npc && this.npc.pax }; }
  log(text) { if (this.d.toast) this.d.toast(text); }
  clearWindow() { this.sale = null; }

  start(level, ctx) {
    this.level = level;
    this.bind(level);
    const m = level.marks.training;
    const at = m ? m.wait : { x: 0, z: 0 };
    this.npc = new Npc({
      id: 'trainee', name: TRAINEE.who,
      x: at.x, y: 0, z: at.z, yaw: at.yaw || 0, speed: 1.1,
    });
    this.npc.skin = 7;
    this.npc.pax = {
      id: 't1', req: { ...TRAINEE }, says: TRAINEE.says,
    };
    this.npc.hidden = true;
    void ctx;
    return this;
  }

  /** True when the player is within `r` meters of a station's box. */
  nearStation(id, r) {
    const st = this.level && this.level.stations.get(id);
    const p = this.d.player && this.d.player();
    if (!st || !st.box || !p) return false;
    const b = st.box;
    const cx = Math.max(b.x0, Math.min(p.x, b.x1));
    const cz = Math.max(b.z0, Math.min(p.z, b.z1));
    return Math.hypot(p.x - cx, p.z - cz) <= r;
  }

  /* ============================================================
     THE STATIONS

     Every one of these is the real action with the real consequence --
     the drawer really moves, the roll really advances -- and every one
     of them refuses until its own step is the current one, so the
     lesson cannot be done out of order by somebody pressing everything.
     ============================================================ */
  bind(level) {
    const on = (id) => this.step && this.step.id === id;
    const set = (id, fn) => {
      const st = level.stations.get(id);
      if (st) st.handler = fn;
    };

    set('room-lights', () => ({
      text: 'Put the light on',
      sub: on('lights') ? 'hold to throw it' : 'not yet',
      hold: 0.7,
      disabled: !on('lights'),
      action: () => { this.flags.add('lights'); this.d.toast('Light on.', 'good'); },
    }));

    set('fare-card', () => ({
      text: 'Read the fare card',
      sub: 'Atlanta is 145 miles. Base 4.50, then 16c a mile.',
      hold: 0,
      disabled: !on('card'),
      action: () => {
        this.flags.add('card');
        /* Read off the same table the sale will use, so the card can
           never quote a fare the register then disagrees with. */
        this.d.toast(`Atlanta, adult, one way: ${money(fareFor(TRAINEE))}.`, 'good');
      },
    }));

    set('ticket-counter', () => {
      if (!this.npc || this.npc.hidden) {
        return { text: 'The window', sub: 'Nobody there yet.', action: null, hold: 0 };
      }
      return {
        text: `Serve ${TRAINEE.who}`,
        sub: TRAINEE.says,
        hold: 0,
        action: () => { if (this.d.talk) this.d.talk(); },
      };
    });

    set('register', () => {
      if (!this.sale) {
        return { text: 'The register', sub: `${money(this.drawer.total)} in the drawer`, action: null, hold: 0 };
      }
      const line = this.sale.promptAt('register', this.drawer);
      if (!line) return { text: 'The register', sub: '', action: null, hold: 0 };
      if (this.sale.step === STEP.QUOTED) {
        return {
          ...line,
          hold: 0,
          action: () => {
            if (!this.sale.take()) { this.d.toast('He is short.', 'warn'); return; }
            this.drawer.take({ b20: 2 });
            this.d.toast(`Took ${money(this.sale.paid)}.`, 'good');
          },
        };
      }
      if (this.sale.step === STEP.PAID) {
        return {
          ...line,
          hold: 0,
          action: () => {
            const r = this.sale.change(this.drawer);
            if (!r.ok) { this.d.toast('No change in the drawer.', 'warn'); return; }
            this.d.toast(`Counted out ${money(this.sale.changeDue)}.`, 'good');
          },
        };
      }
      return { ...line, hold: 0, action: null };
    });

    set('ticket-printer', () => {
      if (!this.sale || this.sale.step !== STEP.CHANGED) {
        return { text: 'The ticket printer', sub: 'Nothing to print.', action: null, hold: 0 };
      }
      const r = ROUTE_BY_ID.get(TRAINEE.route);
      return {
        text: 'Print the ticket',
        sub: `${r ? r.name : TRAINEE.route} / ${TRAINEE.to}`,
        hold: 0,
        action: () => {
          const tk = this.sale.issue(this.book, 0);
          if (tk) this.d.toast(`Ticket ${tk.serial}.`, 'good');
        },
      };
    });

    set('baggage-scale', () => ({
      text: 'Put the case on the scale',
      sub: on('weigh') ? '34 lb — under the fifty' : 'not yet',
      hold: 0,
      disabled: !on('weigh'),
      action: () => {
        this.flags.add('weigh');
        this.d.toast('34 lb. Inside the allowance, so nothing to pay.', 'good');
      },
    }));

    set('baggage-tags', () => ({
      text: 'Tag the case',
      sub: on('tag') ? 'and give him the claim number' : 'weigh it first',
      hold: 0.6,
      disabled: !on('tag'),
      action: () => {
        const c = this.book.check({ route: TRAINEE.route, to: TRAINEE.to, lb: 34, holder: TRAINEE.who });
        this.flags.add('tag');
        this.d.toast(`Claim ${c ? c.claim : '17204'}. He keeps the stub.`, 'good');
      },
    }));

    set('gate-board', () => ({
      text: 'Put the Atlanta up',
      sub: on('board') ? 'departs 20:55, bay 1' : 'not yet',
      hold: 0,
      disabled: !on('board'),
      action: () => { this.flags.add('board'); this.d.toast('Board set.', 'good'); },
    }));

    set('time-clock', () => ({
      text: 'Punch out',
      sub: on('out') ? 'and get over to Richmond Central' : 'when you are finished in here',
      hold: 1.0,
      disabled: !on('out'),
      action: () => { this.flags.add('out'); },
    }));
  }

  /** Called by the dialogue box's top row, and by the window station. */
  serve() {
    const c = conversation(this, () => { if (this.d.closeTalk) this.d.closeTalk(); });
    if (!c) return false;
    const o = c.options.find((x) => !x.disabled && x.act);
    if (!o) return false;
    o.act();
    return true;
  }

  update(dt, ctx) {
    if (this.done) return;
    const step = this.step;
    if (!step) { this.finish(); return; }

    /* the trainee shows up for his own step and not before */
    if (step.id === 'serve' && this.npc && this.npc.hidden) {
      const m = this.level.marks.training;
      this.npc.hidden = false;
      if (m) {
        this.npc.x = m.wait.x; this.npc.z = m.wait.z; this.npc.y = 0;
        this.npc.goTo(m.window.x, 0, m.window.z, ctx);
      }
      /* The sale tells US it is over, rather than the lesson watching
         for a step that has already been reset. Sale.finish puts the
         step back to IDLE on its way out, so there is no state left
         afterwards to detect it by. */
      this.sale = new Sale({
        ...TRAINEE,
        onDone: (out) => {
          this.flags.add('done');
          this.d.toast(
            `${money(out.took)} taken, ${money(out.gave)} back, ticket ${out.ticket.serial}.`,
            'good',
          );
        },
      });
      this.sale.serve();
    }
    if (this.npc && !this.npc.hidden) {
      this.npc.update(dt, ctx);
      if (this.npc.arrived) {
        const m = this.level.marks.training;
        if (m) this.npc.yaw = m.window.yaw || 0;
      }
    }

    /* say the step's lines, one at a time, then leave the objective up */
    this.t += dt;
    if (this.line < step.say.length && this.t >= LINE_TIME) {
      this.t = 0;
      if (this.d.speak) this.d.speak('Training', step.say[this.line]);
      this.line++;
    }

    if (step.done(this)) {
      this.at++;
      this.line = 0;
      this.t = LINE_TIME;
      if (this.at >= STEPS.length) this.finish();
    }
  }

  finish() {
    if (this.done) return;
    this.done = true;
    if (this.npc) this.npc.hidden = true;
    if (this.d.onFinish) this.d.onFinish();
  }

  objective() { return this.step ? this.step.objective : ''; }
  actors() { return this.npc && !this.npc.hidden ? [this.npc] : []; }

  save() { return { at: this.at, flags: [...this.flags], done: this.done }; }
  restore(d) {
    if (!d) return;
    this.at = d.at || 0;
    this.flags = new Set(d.flags || []);
    this.done = !!d.done;
  }
}
