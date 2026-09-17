/* ============================================================
   main.js -- boot. Waits for the DOM, builds the game, gets out of
   the way, and says something useful if it cannot.
   ============================================================ */
import { Game } from './game/game.js';

/**
 * Is this a shipped build?
 *
 * Marked by a `data-prod` attribute the build step puts on this very script
 * tag -- not by an inline script, because the desktop build serves the page
 * under a content policy that allows no inline script at all, and not by a
 * separate module, because a file that only exists to say "this is
 * production" is a file that exists in development too.
 *
 * The development server and the unpackaged desktop build carry no marker,
 * so every harness under tools/ keeps working untouched.
 */
const IS_PRODUCTION = (() => {
  try {
    return !!document.querySelector('script[type="module"][data-prod="1"]');
  } catch (err) { return false; }
})();

/* Modules reachable from the console and from the headless harnesses
   under tools/. Nothing in the game reads these, and a shipped build
   exposes none of them: no handle on the simulation, no reaching into a
   level from the console, nothing to fast-forward a shift with. */
import * as engineInput from './engine/input.js';
import * as engineStorage from './engine/storage.js';
import * as engineUnits from './engine/units.js';
import * as engineCollision from './engine/collision.js';
import * as gameSettings from './game/settings.js';
import * as gameSave from './game/save.js';
import * as gameCampaign from './game/campaign.js';
import * as gameInteraction from './game/interaction.js';
import * as gameDoor from './game/door.js';
import * as uiGlyphs from './ui/glyphs.js';

const start = async () => {
  const game = new Game();
  if (!IS_PRODUCTION) {
    window.__game = game;
    window.__cl = {
      input: engineInput,
      storage: engineStorage,
      units: engineUnits,
      collision: engineCollision,
      settings: gameSettings,
      save: gameSave,
      campaign: gameCampaign,
      interaction: gameInteraction,
      door: gameDoor,
      glyphs: uiGlyphs,
    };
  }
  try {
    await game.boot();
  } catch (err) {
    console.error(err);
    document.body.innerHTML =
      '<pre style="color:#c8b46a;font:14px monospace;padding:2rem;white-space:pre-wrap">'
      + 'COUNTY LINE failed to start.\n\n'
      + `${err && err.stack ? err.stack : err}\n\n`
      + 'Serve the folder over http:// (npm start). Browsers will not load\n'
      + 'ES modules from file://.</pre>';
  }
};

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
else start();
