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
  distance: 1.0,
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
  duckName: '',
  randomOnStart: false,   // bei jedem Browserstart ein neues Zufallsmodell
  hat: '',                // Garderobe: '' = wie das Modell, 'none' = ohne, sonst Hut-Art
  glasses: '',
  follow: true,           // aus = Freilauf: sie lebt auf der Seite statt dem Cursor zu folgen
  escHide: true,          // Esc near her: the family dives, Esc again brings them back
  disabledHosts: []
};

// Reihenfolge muss zu src/models.js passen (nur für "nächstes Modell").
const MODEL_IDS = [
  'mallard', 'mallard-hen', 'rubber', 'pekin', 'mandarin', 'wood', 'tufted', 'teal',
  'runner', 'chonk', 'duckling', 'swan', 'goose', 'debug', 'neon', 'ghost', 'pirate',
  'royal', 'ninja', 'goth', 'party', 'chef', 'wizard', 'astro', 'zombie', 'angel',
  'devil', 'cowboy', 'visionary', 'tycoon', 'techie', 'rainbow', 'galaxy', 'golden'
];

// Callback style wrapped by hand: in Firefox's MV2 background chrome.* returns
// undefined instead of a promise, so awaiting it threw there and took the
// defaults, the welcome and update pages and the shortcuts down with it.
const syncGet = (keys) => new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
const syncSet = (patch) => new Promise((resolve) => chrome.storage.sync.set(patch, resolve));

// Browserstart: Wer das Zufalls-Abo hat, bekommt eine frische Ente.
// randomId() gewichtet Raritäten und filtert Saison-Enten automatisch.
chrome.runtime.onStartup.addListener(async () => {
  const { randomOnStart, model } = await syncGet({ randomOnStart: false, model: 'mallard' });
  if (!randomOnStart || typeof DuckModels === 'undefined') return;
  let next = DuckModels.randomId();
  // kleine Extrafreude: möglichst nicht dieselbe Ente wie zuletzt
  for (let tries = 0; next === model && tries < 4; tries++) next = DuckModels.randomId();
  await syncSet({ model: next });
});

chrome.runtime.onInstalled.addListener(async (details) => {
  // Nur wirklich FEHLENDE Keys mit Defaults auffüllen. Ein blindes
  // Read-Modify-Write über alles würde beim Update-Neustart mit dem
  // parallel laufenden onStartup-Zufallsmodell kollidieren.
  const cur = await syncGet(null);
  const missing = {};
  for (const k in DEFAULTS) if (!(k in cur)) missing[k] = DEFAULTS[k];
  if (Object.keys(missing).length) await syncSet(missing);
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

// One gift per calendar day, however many tabs ask at once. Claims run one
// after the other, so two tabs restored together can't both find yesterday's
// date. Callback-style storage on purpose: chrome.* in Firefox's MV2 background
// has no promises. Local only, like the counters.
let giftQueue = Promise.resolve();

function claimGift(day) {
  const run = giftQueue.then(() => new Promise((resolve) => {
    chrome.storage.local.get({ gifts: { last: '', total: 0, counts: {} } }, (o) => {
      const gifts = o.gifts;
      gifts.counts = gifts.counts || {};
      if (gifts.last === day) { resolve({ gift: null }); return; }
      const id = DuckModels.rollGift(Math.random, gifts.counts);
      const isNew = !gifts.counts[id];
      gifts.counts[id] = (gifts.counts[id] || 0) + 1;
      gifts.total = (gifts.total || 0) + 1;
      gifts.last = day;
      gifts.lastKind = id;
      chrome.storage.local.set({ gifts }, () => resolve({ gift: id, isNew }));
    });
  }));
  giftQueue = run.catch(() => {});
  return run;
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || msg.type !== 'duck:gift') return undefined;
  claimGift(String(msg.day)).then(respond, () => respond({ gift: null }));
  return true;   // answers asynchronously
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === 'toggle-duck') {
    const { enabled } = await syncGet({ enabled: true });
    await syncSet({ enabled: !enabled });
  } else if (cmd === 'next-duck') {
    const { model } = await syncGet({ model: 'mallard' });
    const i = MODEL_IDS.indexOf(model);
    await syncSet({ model: MODEL_IDS[(i + 1) % MODEL_IDS.length] });
  }
});
