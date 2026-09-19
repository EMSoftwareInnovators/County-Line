/* ============================================================
   ui.js -- everything drawn as DOM on top of the framebuffer.

   The APPROACH is Final Rental's and is worth keeping: the 3D picture is
   a canvas at 320x240, and the interface is ordinary HTML in a container
   sized to it, with every dimension in `cqw` so the whole front end
   scales with the window exactly like a fixed-resolution console would.
   Text stays crisp at any size, which drawing it into a 320-pixel-wide
   framebuffer would not.

   The CONTENT is not. Final Rental's UI class knew about the suspect
   notepad, the rotary phone, the tape in your hands, the shift clock and
   the night grade. This one knows about a prompt, a reticle, a toast, an
   objective line and a panel -- the furniture, not the game.
   ============================================================ */
import { Dialogue } from './dialogue.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'),
      reticle: $('reticle'),
      prompt: $('prompt'),
      promptSub: $('prompt-sub'),
      toasts: $('toasts'),
      objective: $('objective'),
      clock: $('clock'),
      clockTime: $('clock-time'),
      clockLabel: $('clock-label'),
      title: $('title'),
      titleMenu: $('title-menu'),
      panel: $('panel'),
      panelBody: $('panel-body'),
      fade: $('fade'),
      debug: $('debug'),
      notice: $('notice'),
    };
    this._toasts = [];
    /** The box you serve somebody through. See ui/dialogue.js. */
    this.talk = new Dialogue();
  }

  /* ---------------- HUD ---------------- */

  setHudVisible(v) { this.el.hud.classList.toggle('hidden', !v); }

  setPrompt(html, sub) {
    this.el.prompt.innerHTML = html || '';
    this.el.promptSub.innerHTML = sub || '';
  }

  setReticle(hot) { this.el.reticle.classList.toggle('hot', !!hot); }

  /** 0..1 fills the reticle clockwise, for a held action. */
  setHold(f) {
    const on = f > 0.001;
    this.el.reticle.classList.toggle('holding', on);
    this.el.reticle.style.setProperty('--hold', String(f));
  }

  setClock(time, label) {
    const on = !!(time || label);
    this.el.clock.classList.toggle('hidden', !on);
    if (!on) return;
    this.el.clockTime.textContent = time || '';
    this.el.clockLabel.textContent = label || '';
  }

  setObjective(text) {
    this.el.objective.textContent = text || '';
    this.el.objective.classList.toggle('hidden', !text);
  }

  toast(text, kind = '') {
    const li = document.createElement('div');
    li.className = `toast ${kind}`;
    li.textContent = text;
    this.el.toasts.appendChild(li);
    this._toasts.push({ el: li, t: 0 });
    while (this._toasts.length > 4) {
      const old = this._toasts.shift();
      if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
    }
  }

  /** A line across the top for something the player has to be told once. */
  notice(text) {
    this.el.notice.textContent = text || '';
    this.el.notice.classList.toggle('hidden', !text);
  }

  update(dt) {
    for (let i = this._toasts.length - 1; i >= 0; i--) {
      const t = this._toasts[i];
      t.t += dt;
      if (t.t > 3.4) {
        if (t.el.parentNode) t.el.parentNode.removeChild(t.el);
        this._toasts.splice(i, 1);
      } else if (t.t > 2.6) {
        t.el.style.opacity = String(1 - (t.t - 2.6) / 0.8);
      }
    }
  }

  /* ---------------- screens ---------------- */

  showTitle(show) { this.el.title.classList.toggle('hidden', !show); }

  /** @param items [{ id, label, sub, disabled }] */
  setTitleMenu(items, sel) {
    this.el.titleMenu.innerHTML = items.map((it, i) => (
      `<li data-act="${it.id}" class="${i === sel ? 'sel' : ''}${it.disabled ? ' off' : ''}">`
      + `${it.label}${it.sub ? `<span class="sub">${it.sub}</span>` : ''}</li>`
    )).join('');
  }

  showPanel(html) {
    this.el.panel.classList.remove('hidden');
    this.el.panelBody.innerHTML = html;
  }
  hidePanel() { this.el.panel.classList.add('hidden'); }
  panelVisible() { return !this.el.panel.classList.contains('hidden'); }

  /** Move the highlight without rebuilding the panel. */
  panelSelect(i) {
    const rows = this.el.panelBody.querySelectorAll('li.opt');
    rows.forEach((el, k) => el.classList.toggle('sel', k === i));
    this.panelReveal(i);
    return rows.length;
  }

  /**
   * Keep the highlighted row on screen. A menu longer than the panel
   * scrolls, and a highlight that walks off the bottom of it is a setting
   * the player cannot see or change -- which is exactly what happened to
   * the picture settings.
   */
  panelReveal(i) {
    const rows = this.el.panelBody.querySelectorAll('li.opt');
    const el = rows[i];
    if (!el || !el.scrollIntoView) return;
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch (err) { /* older engines take no options; the clamp below covers it */ }
    const list = el.parentElement;
    if (!list) return;
    const top = el.offsetTop, bot = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bot > list.scrollTop + list.clientHeight) list.scrollTop = bot - list.clientHeight;
    /* A list with more below it says so. A menu that silently cuts off is
       a menu whose bottom half does not exist as far as a player is
       concerned -- which is what happened to the picture settings. */
    const over = list.scrollHeight - list.clientHeight;
    list.classList.toggle('more-above', list.scrollTop > 2);
    list.classList.toggle('more-below', over > 2 && list.scrollTop < over - 2);
  }

  setFade(v) { this.el.fade.style.opacity = String(Math.max(0, Math.min(1, v))); }

  setDebug(html) {
    this.el.debug.innerHTML = html || '';
    this.el.debug.classList.toggle('hidden', !html);
  }
}
