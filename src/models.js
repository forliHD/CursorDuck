/*
 * (c) 2026 Lucas Reiser (forliHD) — Alle Rechte vorbehalten. Siehe LICENSE.
 *
 * CursorDuck — Entenmodelle 🦆
 *
 * Jedes Modell ist reine Daten: Farben, Proportionen, Accessoires, Effekte.
 * Gezeichnet wird alles prozedural in render.js — keine Bild-Assets,
 * dadurch ist jede Ente bei jeder Größe knackscharf.
 */
(function (root) {
  'use strict';

  // Basiswerte. Alles in "Entеneinheiten" (1 = Körperradius).
  var BASE = {
    id: 'base',
    name: 'Ente',
    emoji: '🦆',
    tier: 'common',
    // Farben
    body: '#f6c945',
    bodyDark: '#d9a521',
    belly: '#fde49a',
    head: '#f6c945',
    headDark: '#d9a521',
    cheek: null,
    neckRing: null,
    beak: '#f08c2e',
    beakDark: '#cf6d18',
    eye: '#ffffff',
    pupil: '#221a12',
    wing: '#efb92f',
    wingBar: '#ffffff',
    tail: '#efb92f',
    foot: '#f08c2e',
    // Form
    bodyW: 1.0,
    bodyH: 0.66,
    headR: 0.47,
    neckLen: 0.58,
    neckW: 0.46,
    beakLen: 0.46,
    beakH: 0.20,
    tailUp: 0.30,
    scale: 1.0,
    chonk: 0,        // 0..1 → runder, breiter
    // Extras
    crest: null,     // {len, color, kind:'tuft'|'spike'|'fan'}
    hat: null,       // 'pirate'|'crown'|'party'|'ninja'|'tophat'|'wizard'|'chef'|'astro'|'cap'|'halo'|'horns'|'cowboy'
    glasses: null,   // 'sun'|'round'|'visor'|'eyepatch'|'monocle'
    // Effekte
    glow: null,      // '#rrggbb'
    ghost: 0,        // 0..1 Transparenz
    sparkle: 0,      // Funkel-Rate
    trail: null,     // Farbe der Schwimmspur
    rainbow: 0,      // Regenbogen-Körperverlauf
    stars: 0,        // Sternen-Körper (Galaxy)
    confetti: 0,     // Konfetti beim Quaken
    quackPitch: 1.0  // Stimmlage
  };

  function duck(o) {
    var d = {};
    for (var k in BASE) d[k] = BASE[k];
    for (var k2 in o) d[k2] = o[k2];
    return d;
  }

  var MODELS = [
    // ── Echte Enten ───────────────────────────────────────────────
    duck({
      id: 'mallard', name: 'Stockente (Erpel)', emoji: '🦆', tier: 'common',
      body: '#9d8f78', bodyDark: '#7d715c', belly: '#d8cfbd',
      head: '#1f7a4d', headDark: '#12563a', neckRing: '#ffffff',
      beak: '#e8c33c', beakDark: '#c39f22',
      wing: '#8a7c66', wingBar: '#4f7fd6', tail: '#6f6151', foot: '#e8952e'
    }),
    duck({
      id: 'mallard-hen', name: 'Stockente (Weibchen)', emoji: '🐦', tier: 'common',
      body: '#b39168', bodyDark: '#8d7050', belly: '#e0cdae',
      head: '#a8845c', headDark: '#856645',
      beak: '#d98f3a', beakDark: '#b06f22',
      wing: '#9d7d56', wingBar: '#5b83c9', tail: '#7b6244', foot: '#e08b33',
      quackPitch: 1.15
    }),
    duck({
      id: 'rubber', name: 'Quietsche-Ente', emoji: '🐤', tier: 'common',
      body: '#ffd83d', bodyDark: '#e8b91b', belly: '#fff0a8',
      head: '#ffd83d', headDark: '#e8b91b',
      beak: '#ff8a1f', beakDark: '#dd6a06',
      wing: '#fcd033', wingBar: '#ffe887', tail: '#fcd033', foot: '#ff8a1f',
      chonk: 0.35, quackPitch: 1.45
    }),
    duck({
      id: 'pekin', name: 'Pekingente', emoji: '🦢', tier: 'common',
      body: '#fdfaf2', bodyDark: '#ddd6c6', belly: '#ffffff',
      head: '#fdfaf2', headDark: '#ddd6c6',
      beak: '#ffa53d', beakDark: '#dd7f16',
      wing: '#f4efe2', wingBar: '#e4dcc9', tail: '#f4efe2', foot: '#ffa53d',
      chonk: 0.25
    }),
    duck({
      id: 'mandarin', name: 'Mandarinente', emoji: '🌈', tier: 'rare',
      body: '#c96a3f', bodyDark: '#a04f2b', belly: '#f5e3c8',
      head: '#6b3fa0', headDark: '#4e2b78', cheek: '#e8a33d',
      beak: '#e04b4b', beakDark: '#b83232',
      wing: '#e0813a', wingBar: '#3f9ac9', tail: '#8a4a2c', foot: '#e8952e',
      crest: { len: 0.55, color: '#2f9e6e', kind: 'fan' }
    }),
    duck({
      id: 'wood', name: 'Brautente', emoji: '💍', tier: 'rare',
      body: '#7a5a44', bodyDark: '#5c422f', belly: '#e8d3b0',
      head: '#2b6b57', headDark: '#1c4a3c', cheek: '#ffffff',
      beak: '#e05a4a', beakDark: '#b83b2c',
      wing: '#6a4c38', wingBar: '#3f6fb5', tail: '#4a3527', foot: '#e0a03a',
      crest: { len: 0.42, color: '#1c4a3c', kind: 'tuft' }
    }),
    duck({
      id: 'tufted', name: 'Reiherente', emoji: '🎩', tier: 'common',
      body: '#2a2a2f', bodyDark: '#18181c', belly: '#ffffff',
      head: '#33333a', headDark: '#1d1d22',
      beak: '#b9c4cf', beakDark: '#8e99a4',
      wing: '#2a2a2f', wingBar: '#ffffff', tail: '#1d1d22', foot: '#9aa5b1',
      eye: '#ffe97a', pupil: '#101014',
      crest: { len: 0.5, color: '#1d1d22', kind: 'spike' }
    }),
    duck({
      id: 'teal', name: 'Krickente', emoji: '🍃', tier: 'common',
      body: '#a9a091', bodyDark: '#877f70', belly: '#e6e0d2',
      head: '#8a4a3c', headDark: '#6a3529', cheek: '#2f8f6a',
      beak: '#4a4a52', beakDark: '#33333a',
      wing: '#9a917f', wingBar: '#2f8f6a', tail: '#6f6658', foot: '#8a8a92',
      scale: 0.88, quackPitch: 1.3
    }),
    duck({
      id: 'runner', name: 'Laufente', emoji: '🏃', tier: 'common',
      body: '#e9dcc2', bodyDark: '#c9b998', belly: '#fbf4e4',
      head: '#e9dcc2', headDark: '#c9b998',
      beak: '#e8b23a', beakDark: '#c08e18',
      wing: '#dfd0b2', wingBar: '#c9b998', tail: '#dfd0b2', foot: '#e8b23a',
      bodyW: 0.82, bodyH: 0.74, neckLen: 0.95, neckW: 0.30, headR: 0.36
    }),
    duck({
      id: 'chonk', name: 'Chonk-Ente', emoji: '🍞', tier: 'common',
      body: '#f2c15a', bodyDark: '#cf9d2e', belly: '#ffeab0',
      head: '#f2c15a', headDark: '#cf9d2e',
      beak: '#ef8a2b', beakDark: '#c96a10',
      wing: '#ecb742', wingBar: '#fff0bd', tail: '#ecb742', foot: '#ef8a2b',
      bodyW: 1.22, bodyH: 0.82, chonk: 1.0, neckLen: 0.34, scale: 1.12,
      quackPitch: 0.78
    }),
    duck({
      id: 'duckling', name: 'Küken', emoji: '🐣', tier: 'common',
      body: '#ffe066', bodyDark: '#e6c22e', belly: '#fff5c2',
      head: '#ffe066', headDark: '#e6c22e',
      beak: '#ffab2e', beakDark: '#e08a10',
      wing: '#ffd94d', wingBar: '#fff5c2', tail: '#ffd94d', foot: '#ffab2e',
      scale: 0.6, chonk: 0.6, headR: 0.5, neckLen: 0.3, beakLen: 0.34,
      quackPitch: 1.9
    }),
    duck({
      id: 'swan', name: 'Schwan', emoji: '🦢', tier: 'rare',
      body: '#ffffff', bodyDark: '#e2e2e8', belly: '#ffffff',
      head: '#ffffff', headDark: '#e2e2e8',
      beak: '#ef7a2e', beakDark: '#c85510',
      wing: '#f7f7fa', wingBar: '#e6e6ec', tail: '#f7f7fa', foot: '#2f2f36',
      bodyW: 1.15, bodyH: 0.7, neckLen: 1.25, neckW: 0.24, headR: 0.32,
      scale: 1.15, quackPitch: 0.7
    }),
    duck({
      id: 'goose', name: 'Gans (aggressiv)', emoji: '😡', tier: 'rare',
      body: '#d9d3c6', bodyDark: '#b3aa99', belly: '#f5f1e6',
      head: '#2f2f34', headDark: '#1c1c20', cheek: '#ffffff',
      beak: '#2f2f34', beakDark: '#18181c',
      wing: '#c9c2b2', wingBar: '#a89e8b', tail: '#8f8677', foot: '#2f2f34',
      bodyW: 1.1, bodyH: 0.72, neckLen: 1.05, neckW: 0.28, headR: 0.34,
      scale: 1.18, quackPitch: 0.62
    }),

    // ── Fantasie-Enten ────────────────────────────────────────────
    duck({
      id: 'debug', name: 'Debug-Ente', emoji: '🐛', tier: 'common',
      body: '#ffd83d', bodyDark: '#e8b91b', belly: '#fff0a8',
      head: '#ffd83d', headDark: '#e8b91b',
      beak: '#ff8a1f', beakDark: '#dd6a06',
      wing: '#fcd033', wingBar: '#ffe887', tail: '#fcd033', foot: '#ff8a1f',
      glasses: 'round', chonk: 0.3, quackPitch: 1.1
    }),
    duck({
      id: 'neon', name: 'Cyber-Ente', emoji: '⚡', tier: 'epic',
      body: '#1b1b2f', bodyDark: '#0e0e1c', belly: '#2a2a4a',
      head: '#1b1b2f', headDark: '#0e0e1c',
      beak: '#00e5ff', beakDark: '#00a8bd',
      wing: '#232345', wingBar: '#ff2e88', tail: '#232345', foot: '#00e5ff',
      eye: '#00e5ff', pupil: '#ff2e88',
      glasses: 'visor', glow: '#00e5ff', trail: 'rgba(0,229,255,0.35)',
      quackPitch: 0.9
    }),
    duck({
      id: 'ghost', name: 'Geister-Ente', emoji: '👻', tier: 'epic',
      body: '#dfe6f5', bodyDark: '#b9c4dd', belly: '#f2f5ff',
      head: '#dfe6f5', headDark: '#b9c4dd',
      beak: '#c7cfe4', beakDark: '#a3adc6',
      wing: '#d5dcef', wingBar: '#ffffff', tail: '#d5dcef', foot: '#c7cfe4',
      eye: '#ffffff', pupil: '#4a5a80',
      ghost: 0.55, glow: '#9fb6ff', quackPitch: 0.55
    }),
    duck({
      id: 'pirate', name: 'Piraten-Ente', emoji: '🏴‍☠️', tier: 'epic',
      body: '#c9a24a', bodyDark: '#a37f2c', belly: '#f0dfae',
      head: '#c9a24a', headDark: '#a37f2c',
      beak: '#e08a2e', beakDark: '#b96a12',
      wing: '#bd952f', wingBar: '#f5e6b8', tail: '#bd952f', foot: '#e08a2e',
      hat: 'pirate', glasses: 'eyepatch', quackPitch: 0.85
    }),
    duck({
      id: 'royal', name: 'Königs-Ente', emoji: '👑', tier: 'epic',
      body: '#f3e9d2', bodyDark: '#d6c9ab', belly: '#fffaf0',
      head: '#f3e9d2', headDark: '#d6c9ab',
      beak: '#e8a33d', beakDark: '#c47f16',
      wing: '#ece0c4', wingBar: '#b8892f', tail: '#ece0c4', foot: '#e8a33d',
      hat: 'crown', sparkle: 0.4, quackPitch: 0.95
    }),
    duck({
      id: 'ninja', name: 'Ninja-Ente', emoji: '🥷', tier: 'epic',
      body: '#2b2f3a', bodyDark: '#191c24', belly: '#3a4050',
      head: '#2b2f3a', headDark: '#191c24',
      beak: '#d98a2e', beakDark: '#b06a12',
      wing: '#333846', wingBar: '#e04b4b', tail: '#333846', foot: '#d98a2e',
      eye: '#ffffff', pupil: '#101014',
      hat: 'ninja', trail: 'rgba(40,44,58,0.4)', quackPitch: 1.05
    }),
    duck({
      id: 'goth', name: 'Goth-Ente', emoji: '🖤', tier: 'rare',
      body: '#26222e', bodyDark: '#161320', belly: '#3b3448',
      head: '#26222e', headDark: '#161320',
      beak: '#7a5bbd', beakDark: '#5b3f96',
      wing: '#2e2938', wingBar: '#a77dff', tail: '#2e2938', foot: '#7a5bbd',
      eye: '#f0e9ff', pupil: '#3a2a5c',
      glasses: 'sun', quackPitch: 0.8
    }),
    duck({
      id: 'party', name: 'Party-Ente', emoji: '🎉', tier: 'epic',
      body: '#ff6fae', bodyDark: '#dd4a8c', belly: '#ffd0e4',
      head: '#ff6fae', headDark: '#dd4a8c',
      beak: '#ffd23d', beakDark: '#e0ae14',
      wing: '#ff86bd', wingBar: '#7ae1ff', tail: '#ff86bd', foot: '#ffd23d',
      hat: 'party', confetti: 1, sparkle: 0.25, quackPitch: 1.35
    }),
    duck({
      id: 'chef', name: 'Chefkoch-Ente', emoji: '👨‍🍳', tier: 'rare',
      body: '#fdfaf2', bodyDark: '#ddd6c6', belly: '#ffffff',
      head: '#fdfaf2', headDark: '#ddd6c6',
      beak: '#ffa53d', beakDark: '#dd7f16',
      wing: '#f4efe2', wingBar: '#e04b4b', tail: '#f4efe2', foot: '#ffa53d',
      hat: 'chef', quackPitch: 1.0
    }),
    duck({
      id: 'wizard', name: 'Zauber-Ente', emoji: '🧙', tier: 'epic',
      body: '#8ea6d8', bodyDark: '#6b82b3', belly: '#d8e2f7',
      head: '#8ea6d8', headDark: '#6b82b3',
      beak: '#ffc94d', beakDark: '#dda31e',
      wing: '#9bb2e0', wingBar: '#ffe9a8', tail: '#9bb2e0', foot: '#ffc94d',
      hat: 'wizard', sparkle: 0.8, glow: '#9fb6ff', quackPitch: 0.75
    }),
    duck({
      id: 'astro', name: 'Astro-Ente', emoji: '🚀', tier: 'epic',
      body: '#eef1f7', bodyDark: '#c8ceda', belly: '#ffffff',
      head: '#eef1f7', headDark: '#c8ceda',
      beak: '#ff8a1f', beakDark: '#dd6a06',
      wing: '#e2e7f0', wingBar: '#ff6b3d', tail: '#e2e7f0', foot: '#ff8a1f',
      hat: 'astro', glow: '#bcd4ff', quackPitch: 0.9
    }),
    duck({
      id: 'zombie', name: 'Zombie-Ente', emoji: '🧟', tier: 'rare',
      body: '#7fa86a', bodyDark: '#5f8450', belly: '#b8d4a2',
      head: '#7fa86a', headDark: '#5f8450',
      beak: '#8e9a5c', beakDark: '#6d7743',
      wing: '#749c60', wingBar: '#4c6b3e', tail: '#749c60', foot: '#8e9a5c',
      eye: '#e8ffd8', pupil: '#2a3a20',
      quackPitch: 0.5
    }),
    duck({
      id: 'angel', name: 'Engels-Ente', emoji: '😇', tier: 'epic',
      body: '#ffffff', bodyDark: '#e6e9f2', belly: '#ffffff',
      head: '#ffffff', headDark: '#e6e9f2',
      beak: '#ffc94d', beakDark: '#dda31e',
      wing: '#f7f9ff', wingBar: '#ffe9a8', tail: '#f7f9ff', foot: '#ffc94d',
      hat: 'halo', glow: '#fff0b8', sparkle: 0.3, quackPitch: 1.2
    }),
    duck({
      id: 'devil', name: 'Teufels-Ente', emoji: '😈', tier: 'epic',
      body: '#c8324a', bodyDark: '#9c2038', belly: '#f08a9c',
      head: '#c8324a', headDark: '#9c2038',
      beak: '#ffb03d', beakDark: '#dd8a12',
      wing: '#b82a42', wingBar: '#ffd24d', tail: '#b82a42', foot: '#ffb03d',
      eye: '#ffe8e8', pupil: '#3a0a12',
      hat: 'horns', glow: '#ff5a4a', quackPitch: 0.6
    }),
    duck({
      id: 'cowboy', name: 'Cowboy-Ente', emoji: '🤠', tier: 'rare',
      body: '#d9a05c', bodyDark: '#b47e3c', belly: '#f4dcb6',
      head: '#d9a05c', headDark: '#b47e3c',
      beak: '#e08a2e', beakDark: '#b96a12',
      wing: '#cf9450', wingBar: '#8a5a2c', tail: '#cf9450', foot: '#e08a2e',
      hat: 'cowboy', quackPitch: 0.88
    }),
    duck({
      id: 'rainbow', name: 'Regenbogen-Ente', emoji: '🌈', tier: 'legendary',
      body: '#ff7a7a', bodyDark: '#d95a5a', belly: '#fff0f0',
      head: '#ff7a7a', headDark: '#d95a5a',
      beak: '#ffd23d', beakDark: '#e0ae14',
      wing: '#ffffff', wingBar: '#ffffff', tail: '#ffffff', foot: '#ffd23d',
      rainbow: 1, sparkle: 0.5, trail: 'rgba(255,255,255,0.3)', quackPitch: 1.25
    }),
    duck({
      id: 'galaxy', name: 'Galaxie-Ente', emoji: '🌌', tier: 'legendary',
      body: '#2a2154', bodyDark: '#170f38', belly: '#4a3a8c',
      head: '#2a2154', headDark: '#170f38',
      beak: '#ffd6f0', beakDark: '#d6a8c8',
      wing: '#332a63', wingBar: '#ffd6f0', tail: '#332a63', foot: '#c9a8ff',
      eye: '#ffffff', pupil: '#170f38',
      stars: 1, glow: '#8f6cff', sparkle: 0.6, quackPitch: 0.7
    }),
    duck({
      id: 'golden', name: 'Goldene Ente', emoji: '✨', tier: 'legendary',
      body: '#ffd24a', bodyDark: '#d9a316', belly: '#fff3c0',
      head: '#ffd24a', headDark: '#d9a316',
      beak: '#ffb01f', beakDark: '#d98a06',
      wing: '#ffdd6a', wingBar: '#fff8d8', tail: '#ffdd6a', foot: '#ffb01f',
      glow: '#ffd24a', sparkle: 1.2, trail: 'rgba(255,210,74,0.3)',
      scale: 1.05, quackPitch: 1.15
    }),

    // ── Saison-Enten (nur in ihrem Monat im Popup wählbar) ────────
    duck({
      id: 'pumpkin', name: 'Kürbis-Ente', emoji: '🎃', tier: 'epic',
      season: { months: [10] },
      body: '#f28c28', bodyDark: '#c96a12', belly: '#ffc078',
      head: '#3e7a34', headDark: '#2a5423',
      beak: '#e8c33c', beakDark: '#c39f22',
      wing: '#e07b1e', wingBar: '#ffd9a8', tail: '#c96a12', foot: '#8a5a2c',
      crest: { len: 0.45, color: '#2a5423', kind: 'spike' },
      glow: '#ff9231', sparkle: 0.4, quackPitch: 0.9
    }),
    duck({
      id: 'xmas', name: 'Weihnachts-Ente', emoji: '🎄', tier: 'epic',
      season: { months: [12] },
      body: '#f4f6f8', bodyDark: '#c9d4de', belly: '#ffffff',
      head: '#d6404a', headDark: '#a92832',
      beak: '#ffb01f', beakDark: '#d98a06',
      wing: '#e8edf2', wingBar: '#d6404a', tail: '#dfe6ec', foot: '#e8952e',
      hat: 'santa', glow: '#ffdfe2', sparkle: 0.5, quackPitch: 1.05
    })
  ];

  var BY_ID = {};
  for (var i = 0; i < MODELS.length; i++) BY_ID[MODELS[i].id] = MODELS[i];

  function get(id) {
    return BY_ID[id] || BY_ID.mallard;
  }

  // Saisonale Modelle sind nur in ihrem Monat verfügbar.
  // month (1–12) ist für Tests übergebbar, Standard = aktueller Monat.
  function isAvailable(m, month) {
    if (!m.season) return true;
    var now = month || (new Date().getMonth() + 1);
    return m.season.months.indexOf(now) !== -1;
  }

  function randomId(rnd) {
    var r = (rnd || Math.random)();
    // Legendaries sind selten, damit sie sich besonders anfühlen.
    var pool = MODELS.filter(function (m) {
      if (!isAvailable(m)) return false;
      if (m.tier === 'legendary') return r < 0.04;
      if (m.tier === 'epic') return r < 0.35;
      return true;
    });
    return pool[Math.floor((rnd || Math.random)() * pool.length)].id;
  }

  root.DuckModels = {
    list: MODELS, get: get, byId: BY_ID, randomId: randomId,
    isAvailable: isAvailable, BASE: BASE
  };
})(typeof window !== 'undefined' ? window : this);
