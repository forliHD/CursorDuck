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

// The first real visit of a day, however many tabs ask at once: the day
// counter, the ducklings' growth and the gift share this queue and the
// calendar day the tab reports (DuckModels.countDay / isNewDay). Claims run one
// after the other, so two tabs restored together can't both find yesterday's
// date. Callback-style storage on purpose: chrome.* in Firefox's MV2 background
// has no promises. Local only, like the counters.
let dayQueue = Promise.resolve();

function claimDay(day, at, force) {
  const run = dayQueue.then(() => new Promise((resolve) => {
    const out = { gift: null, news: [] };
    // not a date: nothing to count (and a read that failed must not hold up the queue)
    if (DuckModels.dayNum(day) !== DuckModels.dayNum(day)) { resolve(out); return; }
    chrome.storage.sync.get({ ducklings: 0 }, (cfg) => {
      const stored = { gifts: { last: '', total: 0, counts: {} }, days: null, brood: null, stats: null };
      chrome.storage.local.get(stored, (o) => {
        if (chrome.runtime.lastError || !cfg || !o) { resolve(out); return; }
        const patch = {};
        // 1.9.0 kept the streak in the play counters and had no brood yet:
        // the first claim after the update writes both records
        const days = DuckModels.daysOf(o.days, o.stats, o.gifts);
        const brood = DuckModels.normBrood(o.brood);
        if (!o.days) patch.days = days;
        if (!o.brood) patch.brood = brood;
        // a new day together: the counter goes up and the ducklings that are out grow
        const next = DuckModels.countDay(days, day, at, force);
        if (next) {
          const grown = DuckModels.growBrood(brood, cfg.ducklings);
          patch.days = next;
          patch.brood = grown.brood;
          out.news = grown.news;
          out.ages = grown.brood.ages;
        }
        const gifts = o.gifts || stored.gifts;
        gifts.counts = gifts.counts || {};
        if (!force && DuckModels.isNewDay(gifts.last, day)) {
          const id = DuckModels.rollGift(Math.random, gifts.counts);
          out.isNew = !gifts.counts[id];
          out.gift = id;
          gifts.counts[id] = (gifts.counts[id] || 0) + 1;
          gifts.total = (gifts.total || 0) + 1;
          gifts.last = day;
          gifts.lastKind = id;
          patch.gifts = gifts;
        }
        if (!Object.keys(patch).length) { resolve(out); return; }
        chrome.storage.local.set(patch, () => resolve(out));
      });
    });
  }));
  dayQueue = run.catch(() => {});
  return run;
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || msg.type !== 'duck:day') return undefined;
  claimDay(String(msg.day), Number(msg.at) || 0, msg.force === true)
    .then(respond, () => respond({ gift: null, news: [] }));
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
