/* ============================================================
   money.js -- cash, in cents, and the change you owe.

   EVERYTHING IN THIS GAME'S MONEY IS AN INTEGER NUMBER OF CENTS. A
   fare is 2775, not 27.75. Floating point and money is the oldest bug
   in commercial software and there is no reason to reinvent it for a
   bus ticket: 0.1 + 0.2 is not 0.3 and a register that is a tenth of a
   cent out at eight o'clock is a dollar out by one.

   THE DRAWER is a count per denomination, not a total, because the
   interesting failure is not being short of money -- it is being short
   of FIVES at half past eleven when everybody is paying for a
   twenty-eight dollar ticket with a fifty. That is a real thing that
   happens on a night shift and it is the reason the opening procedure
   counts a float in.
   ============================================================ */

/** United States, 1998: what is actually in a register drawer. */
export const DENOMS = [
  { id: 'c1', cents: 1, name: 'penny', plural: 'pennies', coin: true },
  { id: 'c5', cents: 5, name: 'nickel', plural: 'nickels', coin: true },
  { id: 'c10', cents: 10, name: 'dime', plural: 'dimes', coin: true },
  { id: 'c25', cents: 25, name: 'quarter', plural: 'quarters', coin: true },
  { id: 'b1', cents: 100, name: 'one', plural: 'ones' },
  { id: 'b5', cents: 500, name: 'five', plural: 'fives' },
  { id: 'b10', cents: 1000, name: 'ten', plural: 'tens' },
  { id: 'b20', cents: 2000, name: 'twenty', plural: 'twenties' },
  { id: 'b50', cents: 5000, name: 'fifty', plural: 'fifties' },
];

export const DENOM_BY_ID = new Map(DENOMS.map((d) => [d.id, d]));
/** Largest first, which is the order you count change out in. */
const DOWN = DENOMS.slice().sort((a, b) => b.cents - a.cents);

/** "$27.75". Negative reads as "-$1.25", which is a drawer that is out. */
export function money(cents) {
  const n = Math.round(cents);
  const s = n < 0 ? '-' : '';
  const a = Math.abs(n);
  return `${s}$${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

/**
 * The change for an amount, largest denomination first.
 *
 * @param cents  how much is owed
 * @param have   optional { denomId: count } -- what the drawer actually
 *               has. Without it the drawer is assumed bottomless, which
 *               is right for a test and wrong for half past eleven.
 * @returns { ok, parts: [{ id, n, cents }], short } -- `short` is what
 *          could not be made up, in cents.
 */
export function makeChange(cents, have) {
  let left = Math.round(cents);
  const parts = [];
  for (const d of DOWN) {
    if (left < d.cents) continue;
    let n = Math.floor(left / d.cents);
    if (have) n = Math.min(n, have[d.id] || 0);
    if (n <= 0) continue;
    parts.push({ id: d.id, n, cents: d.cents * n });
    left -= d.cents * n;
  }
  return { ok: left === 0, parts, short: left };
}

/** "a five, three ones and two quarters" -- for a prompt, not a receipt. */
export function sayChange(parts) {
  if (!parts.length) return 'nothing';
  const bits = parts.map((p) => {
    const d = DENOM_BY_ID.get(p.id);
    return p.n === 1 ? `a ${d.name}` : `${p.n} ${d.plural}`;
  });
  if (bits.length === 1) return bits[0];
  return `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`;
}

/** What a passenger is likely to be holding for a fare of this size. */
export function offerFor(cents, rng) {
  const r = rng || Math.random;
  /* Somebody buying a twenty-eight dollar ticket does not hand over
     twenty-eight dollars. They hand over a twenty and a ten, or two
     twenties, or -- once a night, and it is always at the worst
     moment -- a fifty. */
  const exact = r() < 0.18;
  if (exact) return { paid: cents, note: 'the exact fare' };
  const notes = [2000, 2000, 2000, 5000, 1000, 1000, 500];
  let paid = 0;
  const used = [];
  while (paid < cents) {
    const pick = notes[Math.floor(r() * notes.length)];
    used.push(pick);
    paid += pick;
    if (used.length > 6) break;
  }
  return { paid, note: used.length === 1 ? `a ${DENOMS.find((d) => d.cents === used[0]).name}` : null };
}

/* ============================================================
   THE DRAWER
   ============================================================ */

/**
 * What the clerk counts in at eight o'clock: a hundred and fifty
 * dollars, twenty of it in coin.
 *
 * The shape matters more than the total. Thirty ones and ten fives is
 * what lets you break a twenty all night; five tens is what runs out
 * first when three people in a row pay for a twenty-eight dollar
 * ticket with a fifty, and there is no fifty in the drawer to start
 * with because nobody gives you one back.
 */
export const OPENING_FLOAT = {
  c1: 50, c5: 30, c10: 40, c25: 56,
  b1: 30, b5: 10, b10: 5, b20: 0, b50: 0,
};

export class Drawer {
  constructor(counts) {
    this.counts = { ...(counts || OPENING_FLOAT) };
    for (const d of DENOMS) if (this.counts[d.id] === undefined) this.counts[d.id] = 0;
    /** Every movement, so the shift can be reconciled at one o'clock. */
    this.log = [];
  }

  get total() {
    let c = 0;
    for (const d of DENOMS) c += d.cents * (this.counts[d.id] || 0);
    return c;
  }

  /** A tally the player can read, biggest first. */
  tally() {
    return DOWN.filter((d) => this.counts[d.id] > 0)
      .map((d) => ({ id: d.id, name: d.plural, n: this.counts[d.id], cents: d.cents * this.counts[d.id] }));
  }

  /** Put money in. `parts` is what makeChange returns, or a denom map. */
  take(parts, why) {
    const list = Array.isArray(parts) ? parts : partsOf(parts);
    for (const p of list) this.counts[p.id] = (this.counts[p.id] || 0) + p.n;
    this.log.push({ dir: 1, parts: list, why: why || '' });
    return this;
  }

  /** Take money out. Fails, and moves nothing, if it is not all there. */
  give(parts, why) {
    const list = Array.isArray(parts) ? parts : partsOf(parts);
    for (const p of list) if ((this.counts[p.id] || 0) < p.n) return false;
    for (const p of list) this.counts[p.id] -= p.n;
    this.log.push({ dir: -1, parts: list, why: why || '' });
    return true;
  }

  /** Change for an amount out of THIS drawer, or what it is short. */
  change(cents) { return makeChange(cents, this.counts); }

  save() { return { counts: { ...this.counts }, log: this.log.slice(-64) }; }

  restore(d) {
    if (!d || !d.counts) return false;
    this.counts = { ...d.counts };
    this.log = Array.isArray(d.log) ? d.log.slice() : [];
    return true;
  }
}

/** { b20: 1, b5: 2 } as the part list the drawer moves. */
export function partsOf(map) {
  const out = [];
  for (const d of DOWN) {
    const n = map[d.id] || 0;
    if (n > 0) out.push({ id: d.id, n, cents: d.cents * n });
  }
  return out;
}

/** The smallest set of notes that makes up an amount somebody hands over. */
export function notesFor(cents) { return makeChange(cents).parts; }
