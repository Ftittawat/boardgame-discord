const path = require('path');
const fs = require('fs');

const SLICES_DIR = path.join(__dirname, '..', 'slices');

/**
 * Load all game slices from slices/* folder.
 * Each slice must export: { name, getCommands(), handleInteraction(client, interaction), handleMessage?(client, message) }
 * @returns {Array<{ name: string, getCommands: Function, handleInteraction: Function, handleMessage?: Function }>}
 */
function loadSlices() {
  const names = fs.readdirSync(SLICES_DIR).filter((name) => {
    const p = path.join(SLICES_DIR, name);
    return fs.statSync(p).isDirectory();
  });

  const slices = [];
  for (const name of names) {
    const slicePath = path.join(SLICES_DIR, name, 'index.js');
    if (!fs.existsSync(slicePath)) continue;
    try {
      const slice = require(slicePath);
      if (slice && typeof slice.getCommands === 'function' && typeof slice.handleInteraction === 'function') {
        slices.push({ name, ...slice });
      } else {
        console.warn(`[slices] ${name}: missing getCommands or handleInteraction, skipped`);
      }
    } catch (err) {
      console.warn(`[slices] ${name} failed to load:`, err.message);
    }
  }
  return slices;
}

module.exports = { loadSlices };
