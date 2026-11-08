/**
 * Automated Script Runner for POS Actions
 * Matches newly added POS order items to corresponding .bat files in:
 * C:\Users\Dunesuser\Documents\Scripts\roku
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROKU_DIR = 'C:\\Users\\Dunesuser\\Documents\\Scripts\\roku';
const lastTriggerMap = new Map();
const COOLDOWN_MS = 6000; // 6 second debounce per script

function findMatchingBat(itemName) {
  if (!itemName || typeof itemName !== 'string') return null;
  const clean = itemName.toLowerCase().trim();
  if (!fs.existsSync(ROKU_DIR)) return null;

  const files = fs.readdirSync(ROKU_DIR);

  // Candidate file names
  const candidates = [
    clean + '.bat',
    clean.replace(/\s+/g, '-') + '.bat',
    clean.replace(/\s+/g, '_') + '.bat',
    clean.replace(/\s+/g, '') + '.bat'
  ];

  // Common aliases
  if (clean === 'menu am') candidates.push('tv-on-am.bat', 'menu-am.bat');
  if (clean === 'menu pm') candidates.push('tv-on-pm.bat', 'menu-pm.bat');
  if (clean === 'menu off') candidates.push('tv-off.bat', 'menu-off.bat');
  if (clean === 'tv restart' || clean === 'restart tv') candidates.push('tv-re.bat');
  if (clean === 'grubhub report' || clean === 'gh sales' || clean === 'grubhub sales') candidates.push('grubhub-sales.bat');
  if (clean === 'uber report' || clean === 'uber sales') candidates.push('uber-sales.bat');
  if (clean === 'daily sales' || clean === 'all reports') candidates.push('daily-sales.bat');

  for (const c of candidates) {
    const match = files.find(f => f.toLowerCase() === c.toLowerCase());
    if (match) {
      return path.join(ROKU_DIR, match);
    }
  }
  return null;
}

function executeBatForPosItem(itemName, source = 'POS Register') {
  const batPath = findMatchingBat(itemName);
  if (!batPath) {
    return false;
  }

  const scriptKey = path.basename(batPath).toLowerCase();
  const now = Date.now();
  const lastTime = lastTriggerMap.get(scriptKey) || 0;

  if (now - lastTime < COOLDOWN_MS) {
    console.log(`[POS-Script] Debounce: ${scriptKey} was triggered ${Math.round((now - lastTime) / 1000)}s ago. Skipping.`);
    return true;
  }
  lastTriggerMap.set(scriptKey, now);

  console.log(`[POS-Script] Triggering "${path.basename(batPath)}" for item "${itemName}" (via ${source})...`);

  // Execute the bat file cleanly in the background
  execFile(batPath, [], { cwd: ROKU_DIR }, (error, stdout, stderr) => {
    if (error) {
      console.error(`[POS-Script Error] Failed to run ${batPath}: ${error.message}`);
      return;
    }
    if (stdout && stdout.trim()) {
      console.log(`[POS-Script Output] ${stdout.trim()}`);
    }
    if (stderr && stderr.trim()) {
      console.warn(`[POS-Script Stderr] ${stderr.trim()}`);
    }
    console.log(`[POS-Script] Successfully executed "${path.basename(batPath)}"`);
  });

  return true;
}

module.exports = {
  findMatchingBat,
  executeBatForPosItem,
  ROKU_DIR
};
