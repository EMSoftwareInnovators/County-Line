/* ============================================================
   dialogue.js -- the box you serve somebody through.

   WHY THIS EXISTS AND THE RETICLE PROMPT DOES NOT SUFFICE.

   County Line's prompt is a good interface for a thing: you look at a
   breaker and it tells you what pressing the key would do to it. It is
   a poor interface for a PERSON, because a person is not one action, it
   is a choice between several, and a choice you cannot see is not a
   choice. Selling a ticket through the reticle meant five presses in
   sequence with no branch visible at any of them -- correct, and
   indistinguishable from a machine with a button on it.

   Final Rental had the right shape for this and it is worth taking:
   one framed box, the customer's line at the top, the replies under it,
   arrow keys and a confirm. What is NOT taken is anything about what
   was in that box. It knew about tapes, late fees and a rental
   agreement; this knows about a speaker, a line and a list of options,
   and every option is a closure the caller supplies.

       ui.talk.open({
         who: 'The woman with the holdall',
         tag: 'ATLANTA / one way',
         says: 'Atlanta, please. One way.',
         options: [
           { text: 'Quote the fare', sub: '$45.50', act: () => sale.quote() },
           { text: 'Ask about bags', act: () => ... },
           { text: 'Just a moment', act: null, close: true },
         ],
         foot: 'arrows to choose - E to say it',
       });

   IT IS NOT A MENU. The world keeps running behind it, the player can
   still look around, and nothing is paused: somebody standing at a
   ticket window is not in a menu, they are standing at a ticket window.
   Closing it is always allowed and never cancels the transaction --
   the passenger simply goes on waiting, which is what they do.
   ============================================================ */
const $ = (id) => document.getElementById(id);

export class Dialogue {
  constructor() {
    this.el = {
      root: $('dialogue'),
      who: $('talk-who'),
      tag: $('talk-tag'),
      says: $('talk-says'),
      opts: $('talk-opts'),
      foot: $('talk-foot'),
    };
    this.spec = null;
    this.sel = 0;
    /** Bumped whenever the content changes, so callers can tell. */
    this.revision = 0;
  }

  get open() { return !!this.spec; }

  /**
   * Show a conversation, or update the one already showing.
   *
   * Re-opening with the same `key` keeps the highlighted row where it
   * was, which matters because the list is rebuilt every frame from the
   * sale's state: without it the selection would snap back to the top
   * under the player's hands each time anything changed.
   */
  show(spec) {
    const same = this.spec && this.spec.key === spec.key;
    this.spec = spec;
    if (!same) this.sel = 0;
    const n = spec.options.length;
    if (n === 0) this.sel = 0;
    else if (this.sel >= n) this.sel = n - 1;
    /* never rest on something that cannot be chosen */
    if (n && spec.options[this.sel] && spec.options[this.sel].disabled) {
      const live = spec.options.findIndex((o) => !o.disabled);
      if (live >= 0) this.sel = live;
    }
    this.revision++;
    this.render();
  }

  close() {
    if (!this.spec) return;
    this.spec = null;
    this.sel = 0;
    this.revision++;
    this.el.root.classList.add('hidden');
  }

  /** Move the highlight, skipping anything disabled. */
  move(d) {
    if (!this.spec) return;
    const o = this.spec.options;
    if (!o.length) return;
    for (let i = 1; i <= o.length; i++) {
      const at = (this.sel + d * i % o.length + o.length * 2) % o.length;
      if (!o[at].disabled) { this.sel = at; break; }
    }
    this.render();
  }

  /** @returns true if something was chosen */
  confirm() {
    if (!this.spec) return false;
    const o = this.spec.options[this.sel];
    if (!o || o.disabled) return false;
    if (o.act) o.act();
    /* `close` is the option saying so; the caller closing it from the
       outside (the passenger left, the sale finished) is the usual way. */
    if (o.close) this.close();
    return true;
  }

  render() {
    if (!this.spec) { this.el.root.classList.add('hidden'); return; }
    const s = this.spec;
    this.el.root.classList.remove('hidden');
    this.el.who.textContent = s.who || '';
    this.el.tag.textContent = s.tag || '';
    this.el.says.textContent = s.says || '';
    this.el.foot.textContent = s.foot || '';
    const rows = s.options.map((o, i) => {
      const cls = `${i === this.sel ? 'sel' : ''} ${o.disabled ? 'off' : ''}`.trim();
      const sub = o.sub ? `<span class="o-sub">${esc(o.sub)}</span>` : '';
      return `<li class="${cls}"><span class="o-lbl">${esc(o.text)}</span>${sub}</li>`;
    });
    this.el.opts.innerHTML = rows.join('');
  }
}

function esc(t) {
  return String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
