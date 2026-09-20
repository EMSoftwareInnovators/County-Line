/* ============================================================
   counter.js -- what there is to say to the person at the window.

   THE DIVISION OF LABOUR, because getting it wrong would undo the best
   thing about the counter.

   Selling a ticket is five moves at four places: ask, quote, take,
   change, print. That is deliberate -- it is what makes a ticket window
   a room you work in rather than a button, and the brief asks for
   exactly it. A dialogue box that let the clerk do all five without
   moving would collapse the whole thing back into "press E and a ticket
   appears", which is the thing the brief names as the failure.

   So the box is the CONVERSATION and nothing else. Everything said out
   loud to the passenger is here and chosen from a list; everything done
   to a machine is still at that machine, under the reticle, where it
   was. The steps that belong elsewhere are still SHOWN, greyed, saying
   where they belong -- which is how a player learns the counter without
   being told.

   Nothing in this file changes a sale. It reads one and hands back
   closures that call service.js, the same calls the stations make.
   ============================================================ */
import { STEP } from './service.js';
import { money } from './money.js';

/** A line the clerk can say, and what saying it does. */
const say = (text, act, sub) => ({ text, act, sub });
/** Something that has to be done at a machine, named but not offered. */
const elsewhere = (text, where) => ({ text, sub: where, disabled: true, act: null });

/**
 * Build the box for whoever is at the window, or null for nobody.
 *
 * @param sh  the Shift
 * @param close  what "a moment, please" should do
 */
export function conversation(sh, close) {
  const p = sh.crowd && sh.crowd.atWindow;
  if (!p) return null;

  const sale = sh.sale;
  const base = {
    who: p.req.who,
    says: p.says,
    foot: 'arrows to choose · E to say it · ESC to step away',
  };

  /* ---- somebody who is not buying a ticket ---- */
  if (!sale) {
    const answer = {
      nothing: 'Tell them which bay it goes from',
      meet: 'Tell them whether it is in',
      parcel: 'Send them round to the baggage desk',
      refund: 'Put them on the next one',
    }[p.req.want] || 'Deal with them';
    return {
      ...base,
      key: `ask:${p.id}:${p.req.want}`,
      tag: 'enquiry',
      options: [
        say(answer, () => { sh.log(`${p.req.who}: ${p.req.want}.`); sh.clearWindow(); }),
        say('A moment, please', close),
      ],
    };
  }

  const tag = [
    sale.route_ ? sale.route_.name : sale.req.route,
    sale.req.to,
    sale.req.roundTrip ? 'return' : 'one way',
    sale.req.cls && sale.req.cls !== 'adult' ? sale.req.cls : null,
    sale.req.bags && sale.req.bags.length
      ? `${sale.req.bags.length} to check` : null,
  ].filter(Boolean).join(' · ');

  const opts = [];
  switch (sale.step) {
    case STEP.ASKED:
      if (sale.fare) {
        opts.push(say(`Quote the fare`, () => sale.quote(), money(sale.fare)));
      } else {
        opts.push(say('Tell them we do not go there', () => {
          sh.log(`Turned away: ${sale.req.to}.`);
          sh.clearWindow();
        }));
      }
      opts.push(say('Ask them to say that again', () => {
        sh.d.toast(`${p.req.who}: ${p.says}`);
      }));
      if (sale.req.bags && sale.req.bags.length) {
        opts.push(say('Ask what they are checking', () => {
          const lb = sale.req.bags.map((b) => `${b} lb`).join(', ');
          sh.d.toast(`${p.req.who} has ${sale.req.bags.length} to check — ${lb}.`);
        }));
      } else {
        opts.push(say('Ask if they are checking anything', () => {
          sh.d.toast(`${p.req.who} is carrying it on.`);
        }));
      }
      break;

    case STEP.QUOTED: {
      const offered = sale.req.paid === undefined ? sale.total : sale.req.paid;
      if (offered < sale.total) {
        opts.push(say('Ask them for the rest', () => {
          const was = sale.shortBy;
          sale.topUp();
          sh.log(`${sale.req.who} was ${money(was)} short and found it.`);
        }, `${money(sale.total - offered)} short`));
      } else {
        opts.push(elsewhere('Take the money and ring it up', 'at the register'));
      }
      opts.push(say('Say the fare again', () => {
        sh.d.toast(`${money(sale.total)}, please.`);
      }, money(sale.total)));
      break;
    }

    case STEP.PAID:
      opts.push(elsewhere('Count out their change', 'at the register'));
      break;

    case STEP.CHANGED:
      opts.push(elsewhere('Print the ticket', 'at the ticket printer'));
      break;

    case STEP.PRINTED:
      opts.push(say('Hand it over', () => sale.finish(),
        sale.checks.length
          ? `and ${sale.checks.length} claim check${sale.checks.length === 1 ? '' : 's'}`
          : null));
      break;

    default:
      break;
  }

  opts.push(say('A moment, please', close));
  return { ...base, key: `sale:${p.id}:${sale.step}`, tag, options: opts };
}

/* ============================================================
   DRIVING IT

   Kept here rather than in game.js for the ordinary reason -- game.js
   is at its size limit and this is counter business -- and for a better
   one: the rules about when the box opens, stays open and closes are
   part of what serving somebody at a window IS, and they belong next to
   the lines it offers.
   ============================================================ */

/** How far from the window the box survives, in meters. */
const LEAN = 2.6;

/**
 * Whoever owns the window here.
 *
 * A Shift on a night, the training room on the lesson. Both keep the
 * same six things conversation() reads -- who is at the window, the
 * sale, a log, a toast, a way to clear the window and a drawer -- which
 * is the whole reason the box works in a room with no timetable in it.
 */
const hostOf = (game) => game.shift || game.training || null;

/** Open the box on whoever is at the window. Called by the station. */
export function openTalk(game) {
  const host = hostOf(game);
  const spec = host && conversation(host, () => game.ui.talk.close());
  if (spec) game.ui.talk.show(spec);
}

/**
 * Keep it honest, and hand it the keys.
 *
 * REBUILT EVERY FRAME, because the sale moves underneath it: the
 * register is a walk away and the player goes and uses it, and a box
 * still offering "quote the fare" after the fare was quoted is a lie
 * with a button on it. Dialogue.show keeps the highlight where the
 * player left it as long as the `key` is unchanged, so rebuilding is
 * invisible until something actually happens.
 *
 * It closes when the player walks away from the window, when the
 * passenger goes, or when they ask it to. It never closes because the
 * sale advanced -- a clerk does not stop serving somebody because they
 * have just printed their ticket.
 */
export function updateTalk(game, input) {
  const talk = game.ui.talk;
  if (!talk.open) return false;

  const st = game.level.stations.get('ticket-counter');
  const box = st && st.box;
  const p = game.player;
  const near = box && p
    && p.x > box.x0 - LEAN && p.x < box.x1 + LEAN
    && p.z > box.z0 - LEAN && p.z < box.z1 + LEAN;
  /* AND LOOKING AT THEM. Standing near is not enough: the register is
     a pace along the same counter, so a box that survived on proximity
     alone was still up and still eating the use key when the player
     turned to ring the sale in. You are talking to somebody while you
     are facing them; turn to a machine and the machine has your
     attention. Looking at nothing keeps the box, because glancing down
     at the counter is not walking off mid-sentence. */
  const t = game.level.interact.target;
  const elsewhere_ = t && t.id !== 'station:ticket-counter';
  const host = hostOf(game);
  const spec = host ? conversation(host, () => talk.close()) : null;
  if (!spec || !near || elsewhere_) { talk.close(); return false; }
  talk.show(spec);

  if (input.hit('uiUp')) talk.move(-1);
  if (input.hit('uiDown')) talk.move(1);
  if (input.hit('uiBack')) { talk.close(); return true; }
  if (input.hit('uiConfirm') || input.hit('interact')) {
    talk.confirm();
    return true;
  }
  /* The box has the keys while it is up: looking around is still
     yours, but the use key belongs to whoever you are talking to. */
  return true;
}
