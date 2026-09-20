/* ============================================================
   setup.js -- wiring a level's terminal up, once it is built.

   This was fifty lines in the middle of Game.loadLevel, which is the
   wrong place for it twice over: game.js is the harness that runs a
   level and this is what makes one a bus terminal, and game.js has a
   hard size limit that this kept pushing it over.

   EVERY PIECE IS OPTIONAL AND ASKS THE LEVEL. The testbed has no
   breaker panel; the training room has a counter and no timetable;
   Richmond Central has all of it. Nothing here assumes a building.
   ============================================================ */
import { Power } from './power.js';
import { Fleet } from './fleet.js';
import { Shift } from './shift.js';
import { bindShift } from './stations.js';
import { TerminalSound } from './sound.js';
import { openTalk } from './counter.js';
import { Training } from './training.js';

/** @param g the Game, which owns everything this hangs off. */
export function buildTerminalSystems(g) {
  /* ---- the building's electricity ----
     Built from the schedule the level declared, and only if it
     declared one: the testbed has no breaker panel and does not need
     to pretend it has. */
  g.power = g.level.circuits.length ? new Power(g.level, {
    onTrip: (c) => g.onCircuitTrip(c),
    toast: (t) => g.ui.toast(t),
  }) : null;
  if (g.power) {
    g.power.openForBusiness();
    g.power.bind(g.level, g.ctx());
    g.power.apply();
  }
  /* ---- the coaches ----
     One mesh, built once, and a matrix per bus. The fleet adds itself
     to level.movers, so a coach standing at a berth is eight and a
     half feet of solid on the apron like anything else. */
  g.fleet = new Fleet(g.materials, g.level);

  /* ---- and the night's work ----
     Only for a level that has a terminal in it. The testbed has a
     crate and a test actor and does not need a timetable. */
  /* A TICKET COUNTER IS NOT A TERMINAL. The training room has one of
     those too, and a Shift built on it would be a five-hour timetable
     with no line, no seats, no platform and no coaches to put on it.
     What a Shift actually needs is the `service` mark -- the level
     saying where the window is, where the line forms and where people
     come in and go out -- so that is what is asked for. */
  g.shift = g.level.marks.service
    ? new Shift({
      level: g.level,
      power: g.power,
      fleet: g.fleet,
      ctx: () => g.ctx(),
      toast: (t, k) => g.ui.toast(t, k),
      say: (line) => g.ui.toast(line, 'pa'),
      talk: () => openTalk(g),
      sfx: (cue, pan) => { if (g.sfx[cue]) g.sfx[cue](pan || 0); },
      seed: 19981020,
    })
    : null;
  if (g.shift) {
    /* The chime before the clerk speaks, which is the sound a
       terminal makes more than any other. */
    g.shift.pa.opt.onStart = () => g.sfx.paChime(0);
    g.shift.phone.opt.onRing = (c) => {
      g.ui.toast(`The telephone is ringing in the office. (${c.who})`);
      g.sfx.phoneRing(0);
    };
    g.terminalSound = new TerminalSound();
  }
  if (g.shift) bindShift(g.level, g.shift, g.ctx());

  /* ---- and the training room, if this is it ----
     The lesson before the shift. It is its own level, so it is built
     only for that level and knows nothing about Richmond Central except
     that punching out is what loads it. See terminal/training.js. */
  g.training = g.level.id === 'training' ? new Training({
    toast: (t, k) => g.ui.toast(t, k),
    speak: (who, line) => g.ui.toast(`${who}: ${line}`, 'say'),
    player: () => g.player,
    talk: () => openTalk(g),
    closeTalk: () => g.ui.talk.close(),
    onFinish: () => g.finishTraining(),
  }).start(g.level, g.ctx()) : null;
}
