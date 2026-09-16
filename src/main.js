/* ============================================================
   main.js -- boot. Waits for the DOM, builds the game, gets out of
   the way, and says something useful if it cannot.
   ============================================================ */
import { Game } from './game/game.js';

/* Modules reachable from the console and from the headless harnesses
   under tools/. Nothing in the game reads these. */
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
