/*
 * (c) 2026 Lucas Reiser (forliHD) — Alle Rechte vorbehalten. Siehe LICENSE.
 *
 * CursorDuck — Service Worker
 * Kümmert sich um Defaults, Tastenkürzel und das Zufallsmodell pro Browserstart.
 * Alles läuft über storage.sync — die Content-Scripts hören auf onChanged.
 */

// Modellkatalog laden: im MV3-Service-Worker per importScripts, im
// Firefox-MV2-Hintergrund kommt models.js über das scripts-Array (build.py).
if (typeof DuckModels === 'undefined' && typeof importScripts === 'function') {
  importScripts('models.js');
}

const DEFAULTS = {
  enabled: true,
  model: 'mallard',
  size: 1.0,
  speed: 1.0,
  ducklings: 0,
  playfulness: 1.0,
  sound: false,
  volume: 0.35,
  effects: true,
  reflection: true,
  opacity: 1.0,
  peck: true,
  feed: true,
  sleepAfter: 15,
  randomOnStart: false,   // bei jedem Browserstart ein neues Zufallsmodell
  disabledHosts: []
};

// Reihenfolge muss zu src/models.js passen (nur für "nächstes Modell").
const MODEL_IDS = [
  'mallard', 'mallard-hen', 'rubber', 'pekin', 'mandarin', 'wood', 'tufted', 'teal',
  'runner', 'chonk', 'duckling', 'swan', 'goose', 'debug', 'neon', 'ghost', 'pirate',
  'royal', 'ninja', 'goth', 'party', 'chef', 'wizard', 'astro', 'zombie', 'angel',
  'devil', 'cowboy', 'visionary', 'rainbow', 'galaxy', 'golden'
];

// Browserstart: Wer das Zufalls-Abo hat, bekommt eine frische Ente.
// randomId() gewichtet Raritäten und filtert Saison-Enten automatisch.
chrome.runtime.onStartup.addListener(async () => {
  const { randomOnStart, model } = await chrome.storage.sync.get({ randomOnStart: false, model: 'mallard' });
  if (!randomOnStart || typeof DuckModels === 'undefined') return;
  let next = DuckModels.randomId();
  // kleine Extrafreude: möglichst nicht dieselbe Ente wie zuletzt
  for (let tries = 0; next === model && tries < 4; tries++) next = DuckModels.randomId();
  await chrome.storage.sync.set({ model: next });
});

chrome.runtime.onInstalled.addListener(async (details) => {
  // Nur wirklich FEHLENDE Keys mit Defaults auffüllen. Ein blindes
  // Read-Modify-Write über alles würde beim Update-Neustart mit dem
  // parallel laufenden onStartup-Zufallsmodell kollidieren.
  const cur = await chrome.storage.sync.get(null);
  const missing = {};
  for (const k in DEFAULTS) if (!(k in cur)) missing[k] = DEFAULTS[k];
  if (Object.keys(missing).length) await chrome.storage.sync.set(missing);
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
  } else if (details.reason === 'update') {
    // Update-Seite nur bei Feature-Updates (x.Y-Sprung), nicht bei Patches
    const prev = String(details.previousVersion || '').split('.');
    const cur2 = chrome.runtime.getManifest().version.split('.');
    if (prev[0] !== cur2[0] || prev[1] !== cur2[1]) {
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome/update.html') });
    }
  }
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === 'toggle-duck') {
    const { enabled } = await chrome.storage.sync.get({ enabled: true });
    await chrome.storage.sync.set({ enabled: !enabled });
  } else if (cmd === 'next-duck') {
    const { model } = await chrome.storage.sync.get({ model: 'mallard' });
    const i = MODEL_IDS.indexOf(model);
    await chrome.storage.sync.set({ model: MODEL_IDS[(i + 1) % MODEL_IDS.length] });
  }
});
