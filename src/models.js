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
    hat: null,       // 'pirate'|'crown'|'party'|'ninja'|'tophat'|'wizard'|'chef'|'astro'|'cap'|'halo'|'horns'|'cowboy'|'headphones'
    glasses: null,   // 'sun'|'round'|'visor'|'eyepatch'|'monocle'|'nerd'
    print: null,     // short text printed on the chest ("</>")
    printColor: null,
    lanyard: null,   // '#rrggbb': a lanyard with a badge hangs from the neck
    // Effekte
    glow: null,      // '#rrggbb'
    ghost: 0,        // 0..1 Transparenz
    sparkle: 0,      // Funkel-Rate
    trail: null,     // Farbe der Schwimmspur
    rainbow: 0,      // Regenbogen-Körperverlauf
    stars: 0,        // Sternen-Körper (Galaxy)
    confetti: 0,     // Konfetti beim Quaken
    goldNap: 0,      // naps in a little gold hoard (engine state 'goldnap')
    codeNap: 0,      // falls asleep at her laptop instead (engine state 'codenap')
    debugDuck: 0,    // explains her bugs to a rubber duck (idle action 'debug')
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
      // Schwarzer Rollkragen, runde Brille, große Visionen. Ab und zu
      // ersetzt ein Spruch das Quaken (sayings, gerendert von engine.say).
      id: 'visionary', name: 'Visionärs-Ente', emoji: '💡', tier: 'epic',
      body: '#2e2e33', bodyDark: '#1c1c20', belly: '#3c3c44',
      head: '#e8e2d4', headDark: '#c6bfae', neckRing: '#232327',
      beak: '#f08c2e', beakDark: '#cf6d18',
      wing: '#333338', wingBar: '#4a4a52', tail: '#28282d', foot: '#8a8f98',
      glasses: 'round', quackPitch: 0.95,
      sayings: ['One more thing …', 'iQuack.', 'Think different.',
                'Quack different.', 'It just works.', 'Insanely great!',
                'Boom!', "You're holding it wrong.", 'Real artists ship.',
                'Stay hungry. Stay foolish.', "There's a quack for that.",
                'Simplicity quacks.']
    }),
    duck({
      // Old-money magnate: top hat, monocle, red tailcoat over white
      // feathers. Instead of a plain nap it first summons a little gold
      // hoard and dives in headfirst (engine state 'goldnap').
      id: 'tycoon', name: 'Milliardärs-Ente', emoji: '💰', tier: 'epic',
      body: '#c4392c', bodyDark: '#992a20', belly: '#e26a55',
      head: '#f6f0e2', headDark: '#d8cfba',
      beak: '#f0a63c', beakDark: '#cd8420',
      wing: '#b53327', wingBar: '#e8c33c', tail: '#a92e22', foot: '#f0a63c',
      hat: 'tophat', glasses: 'monocle',
      goldNap: 1, sparkle: 0.2, quackPitch: 0.82
    }),
    duck({
      // The IT department's duck: heather-grey hoodie (the body, collar as
      // neck ring) with a "</>" print, thick glasses and a lanyard badge.
      // Falls asleep at her laptop (engine state 'codenap'), debugs with a
      // rubber duck (idle action 'debug') and now and then a one-liner
      // replaces the quack.
      id: 'techie', name: 'IT-Ente', emoji: '💻', tier: 'epic',
      body: '#5e6573', bodyDark: '#434955', belly: '#7b8290',
      head: '#ffd83d', headDark: '#e8b91b', neckRing: '#525966',
      beak: '#ff8a1f', beakDark: '#dd6a06',
      wing: '#575e6c', wingBar: '#3d4350', tail: '#4b515e', foot: '#ff8a1f',
      eye: '#ffffff', pupil: '#221a12',
      hat: 'headphones', glasses: 'nerd',
      print: '</>', printColor: '#eef0f4', lanyard: '#e04b4b',
      codeNap: 1, debugDuck: 1, quackPitch: 0.95,
      sayings: ['It works on my machine.', 'Have you tried turning it off and on again?',
                'sudo quack', '404: bread not found', "It's not a bug, it's a feature.",
                "There's no place like 127.0.0.1", 'git blame says: you.',
                'Have you cleared your cache?', 'Duck typing. Literally.',
                'Rubber duck? I AM the duck.', 'Deploy on Friday? Quack no.',
                '99 little bugs in the code …']
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
    }),
    duck({
      // Ostern ist beweglich — verfügbar von 3 Wochen vor bis 1 Woche
      // nach dem (per Gauß-Formel berechneten) Ostersonntag.
      id: 'easter', name: 'Oster-Ente', emoji: '🐰', tier: 'epic',
      season: { easter: true },
      body: '#fff3d6', bodyDark: '#e8d3a2', belly: '#fffaf0',
      head: '#fff3d6', headDark: '#e8d3a2',
      beak: '#ffab2e', beakDark: '#e08a10',
      wing: '#ffeec2', wingBar: '#ffd0e4', tail: '#ffeec2', foot: '#ffab2e',
      hat: 'bunny',
      dots: ['#ff9ec4', '#8ce0c9', '#a8c8ff', '#ffd23d'],
      sparkle: 0.3, quackPitch: 1.25
    }),
    duck({
      id: 'valentine', name: 'Valentins-Ente', emoji: '💘', tier: 'epic',
      season: { months: [2] },
      body: '#f7a8c4', bodyDark: '#d97ba0', belly: '#ffe3ee',
      head: '#f7a8c4', headDark: '#d97ba0', cheek: '#e04b7a',
      beak: '#e04b4b', beakDark: '#b83232',
      wing: '#f291b8', wingBar: '#ffffff', tail: '#e07ba4', foot: '#e04b7a',
      glow: '#ff8fb5', sparkle: 0.5, quackPitch: 1.2
    }),
    duck({
      id: 'newyear', name: 'Neujahrs-Ente', emoji: '🎆', tier: 'epic',
      season: { months: [1] },
      body: '#2c3e6e', bodyDark: '#1c2a4e', belly: '#d8e2f7',
      head: '#2c3e6e', headDark: '#1c2a4e',
      beak: '#ffd23d', beakDark: '#e0ae14',
      wing: '#3d5386', wingBar: '#ffd23d', tail: '#3d5386', foot: '#ffd23d',
      hat: 'party', confetti: 1, glow: '#ffd23d', sparkle: 0.6, quackPitch: 1.1
    })
  ];

  // ── Wardrobe ──────────────────────────────────────────────────
  // Accessories the user can put on any model (drawn by render.js).
  // Each one is unlocked by an achievement: `stat` must reach `goal`;
  // `ach` names the popup's achievement key so the lock can say which one.
  // `name` is the German fallback like the models' names; the popup shows
  // the localized `wear_<id>` string when available.
  var WARDROBE = [
    { id: 'cap',      kind: 'hat',     name: 'Kappe',           stat: 'pecks',         goal: 25,  ach: 'achPecks1' },
    { id: 'party',    kind: 'hat',     name: 'Partyhut',        stat: 'dances',        goal: 5,   ach: 'achDance1' },
    { id: 'cowboy',   kind: 'hat',     name: 'Cowboyhut',       stat: 'waddles',       goal: 5,   ach: 'achWaddle' },
    { id: 'santa',    kind: 'hat',     name: 'Weihnachtsmütze', stat: 'sleeps',        goal: 10,  ach: 'achSleep' },
    { id: 'halo',     kind: 'hat',     name: 'Heiligenschein',  stat: 'nests',         goal: 5,   ach: 'achNest' },
    { id: 'tophat',   kind: 'hat',     name: 'Zylinder',        stat: 'goldNaps',      goal: 1,   ach: 'achGold1' },
    { id: 'bunny',    kind: 'hat',     name: 'Hasenohren',      stat: 'visits',        goal: 10,  ach: 'achVisit2' },
    { id: 'chef',     kind: 'hat',     name: 'Kochmütze',       stat: 'crumbs',        goal: 100, ach: 'achCrumbs2' },
    { id: 'astro',    kind: 'hat',     name: 'Astro-Helm',      stat: 'bursts',        goal: 10,  ach: 'achBurst2' },
    { id: 'wizard',   kind: 'hat',     name: 'Zauberhut',       stat: 'dizzy',         goal: 25,  ach: 'achDizzy2' },
    { id: 'ninja',    kind: 'hat',     name: 'Ninja-Maske',     stat: 'peekaboos',     goal: 25,  ach: 'achPeek2' },
    { id: 'horns',    kind: 'hat',     name: 'Hörnchen',        stat: 'startles',      goal: 50,  ach: 'achStartle2' },
    { id: 'pirate',   kind: 'hat',     name: 'Piratenhut',      stat: 'fish',          goal: 100, ach: 'achFish3' },
    { id: 'crown',    kind: 'hat',     name: 'Krone',           stat: 'pets',          goal: 500, ach: 'achPets3' },
    { id: 'headphones', kind: 'hat',   name: 'Kopfhörer',       stat: 'codeNaps',      goal: 1,   ach: 'achCode1' },
    { id: 'sun',      kind: 'glasses', name: 'Sonnenbrille',    stat: 'pets',          goal: 10,  ach: 'achPets1' },
    { id: 'round',    kind: 'glasses', name: 'Runde Brille',    stat: 'modelSwitches', goal: 10,  ach: 'achStyle' },
    { id: 'eyepatch', kind: 'glasses', name: 'Augenklappe',     stat: 'fish',          goal: 25,  ach: 'achFish2' },
    { id: 'monocle',  kind: 'glasses', name: 'Monokel',         stat: 'goldNaps',      goal: 10,  ach: 'achGold2' },
    { id: 'visor',    kind: 'glasses', name: 'Visor',           stat: 'surfs',         goal: 100, ach: 'achSurf2' },
    { id: 'nerd',     kind: 'glasses', name: 'Nerdbrille',      stat: 'codeNaps',      goal: 10,  ach: 'achCode2' },
    { id: 'wreath',   kind: 'hat',     name: 'Laubkranz',       stat: 'giftKinds',     goal: 7,   ach: 'achGift2' }
  ];

  // ── Daily gifts ───────────────────────────────────────────────
  // What she brings on the first visit of the day (drawn by render.js).
  // `w` is the weight in the draw, `name` the German fallback; the popup and
  // the toast use the localized `gift_<id>` / `giftD_<id>` strings.
  var GIFTS = [
    { id: 'pebble',   name: 'Kiesel',       tier: 'common',    w: 12 },
    { id: 'shell',    name: 'Muschel',      tier: 'common',    w: 12 },
    { id: 'snail',    name: 'Schnecke',     tier: 'common',    w: 12 },
    { id: 'feather',  name: 'Feder',        tier: 'common',    w: 12 },
    { id: 'acorn',    name: 'Eichel',       tier: 'common',    w: 12 },
    { id: 'marble',   name: 'Murmel',       tier: 'uncommon',  w: 5 },
    { id: 'button',   name: 'Knopf',        tier: 'uncommon',  w: 5 },
    { id: 'cork',     name: 'Korken',       tier: 'uncommon',  w: 5 },
    { id: 'clover',   name: 'Kleeblatt',    tier: 'rare',      w: 2.5 },
    { id: 'starfish', name: 'Seestern',     tier: 'rare',      w: 2.5 },
    { id: 'coin',     name: 'Alte Münze',   tier: 'rare',      w: 2.5 },
    { id: 'pearl',    name: 'Perle',        tier: 'epic',      w: 1.2 },
    { id: 'bottle',   name: 'Flaschenpost', tier: 'epic',      w: 1.2 },
    { id: 'goldegg',  name: 'Goldenes Ei',  tier: 'legendary', w: 0.6 }
  ];
  var GIFT_BY_ID = {};
  for (var gi = 0; gi < GIFTS.length; gi++) GIFT_BY_ID[GIFTS[gi].id] = GIFTS[gi];

  // One draw from the catalog. Anything not collected yet counts double, so
  // the shelf fills up without a long run of duplicates at the start.
  function rollGift(rnd, counts) {
    var c = counts || {}, total = 0, i;
    for (i = 0; i < GIFTS.length; i++) total += GIFTS[i].w * (c[GIFTS[i].id] ? 1 : 2);
    var r = (rnd || Math.random)() * total;
    for (i = 0; i < GIFTS.length; i++) {
      r -= GIFTS[i].w * (c[GIFTS[i].id] ? 1 : 2);
      if (r <= 0) return GIFTS[i].id;
    }
    return GIFTS[0].id;
  }

  // The counters behind the gift achievements and the wardrobe lock, derived
  // from the stored collection ({ total, counts }).
  function giftStats(gifts) {
    var c = (gifts && gifts.counts) || {}, kinds = 0, rares = 0;
    for (var i = 0; i < GIFTS.length; i++) {
      var n = c[GIFTS[i].id] || 0;
      if (!n) continue;
      kinds++;
      if (GIFTS[i].tier !== 'common' && GIFTS[i].tier !== 'uncommon') rares += n;
    }
    return { giftsTotal: (gifts && gifts.total) || 0, giftKinds: kinds, giftRares: rares };
  }

  // Local calendar day, the same format the daily streak uses.
  function dayKey(d) {
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  // ── Days together ─────────────────────────────────────────────
  // One calendar for the day counter, the ducklings' growth and the daily
  // gift: local calendar days in dayKey() form. The distance between two days
  // comes from the calendar alone, never from elapsed hours, so the 23- and
  // 25-hour days around a clock change still count as one day each.
  function dayNum(key) {
    var p = String(key || '').split('-');
    if (p.length !== 3) return NaN;
    var y = +p[0], m = +p[1], d = +p[2];
    if (!(y >= 1970 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return NaN;
    return Math.round(Date.UTC(y, m - 1, d) / 86400000);
  }

  function daysBetween(from, to) {
    return dayNum(to) - dayNum(from);
  }

  // Is `today` a day after `last`? A date up to two days back is a trip
  // across time zones and must not count a day twice; further back the clock
  // was wrong, and today starts afresh. Nothing stored yet: a new day.
  function isNewDay(last, today) {
    if (dayNum(today) !== dayNum(today)) return false;   // not a date: nobody's new day
    var d = daysBetween(last, today);
    return !(d >= -2 && d <= 0);
  }

  function count(v) {
    return typeof v === 'number' && v >= 0 && v < 1e7 ? Math.floor(v) : 0;
  }

  // { last, at, streak, best, total }: the last day together and the moment it
  // was counted, days in a row up to it, the longest run so far and all days
  // together. Anything broken in storage reads as zero instead of NaN.
  function normDays(days) {
    var o = days || {}, streak = count(o.streak);
    return {
      v: 1,
      last: typeof o.last === 'string' ? o.last : '',
      at: typeof o.at === 'number' && o.at > 0 && o.at < 1e14 ? o.at : 0,
      streak: streak,
      best: Math.max(count(o.best), streak),
      total: Math.max(count(o.total), streak)
    };
  }

  // Calendar days from the last day together to `today`. A long flight east
  // can skip a date nobody lived through, so the last meeting also counts as
  // the day it was in today's time zone.
  function daysSince(o, today) {
    var d = daysBetween(o.last, today);
    if (d > 1 && o.at) {
      var seen = daysBetween(dayKey(new Date(o.at)), today);
      if (seen >= 1 && seen < d) d = seen;
    }
    return d;
  }

  // Up to 1.9.0 the streak lived in the play counters (streakDays /
  // streakLast) and counted every page load. The first record starts there;
  // gifts came one per day, so they are days together as well.
  function legacyDays(stats, gifts) {
    var s = stats || {}, streak = count(s.streakDays);
    return normDays({
      last: s.streakLast, streak: streak, best: streak,
      total: Math.max(streak, count(gifts && gifts.total))
    });
  }

  function daysOf(days, stats, gifts) {
    return days ? normDays(days) : legacyDays(stats, gifts);
  }

  // One more day together, or null when `today` is counted already (see
  // isNewDay). `at` is the moment of the visit. A gap ends the streak, never
  // the record or the total. `force` adds a day without moving the date (the
  // popup's test switch), so the real next day still counts.
  function countDay(days, today, at, force) {
    var o = normDays(days);
    if (dayNum(today) !== dayNum(today)) return null;   // not a date
    var d = daysSince(o, today);
    if (!force && d >= -2 && d <= 0) return null;
    o.streak = force || d === 1 ? o.streak + 1 : 1;
    o.best = Math.max(o.best, o.streak);
    o.total += 1;
    if (!force) {
      o.last = today;
      o.at = typeof at === 'number' && at > 0 && at < 1e14 ? at : 0;
    }
    return o;
  }

  // Where the streak stands on `today`: { streak, today }. Yesterday's run
  // can still grow today; a whole missed day has ended it. `today` says
  // whether this day is counted already.
  function streakNow(days, today) {
    var o = normDays(days), d = daysSince(o, today);
    return { streak: d >= -2 && d <= 1 ? o.streak : 0, today: d >= -2 && d <= 0 };
  }

  // The counters behind the day badges. The record, not the running streak:
  // a badge once earned doesn't go away with a missed day.
  function dayStats(days) {
    var o = normDays(days);
    return { streakDays: o.best, daysTotal: o.total };
  }

  // ── Ducklings that grow up ────────────────────────────────────
  // Every duckling slot has an age in days together, and her look follows
  // her stage: `grow` is how far render.js takes her from fluffball to
  // mama's looks, `size` her radius against mama's. At GROWN_AT she is grown
  // up: she flies off into the world and a new one hatches in her place.
  // `name` is the German fallback; the popup and the label over her head use
  // the localized `stage_<id>` strings.
  var BROOD_STAGES = [
    { id: 'fluff', from: 0,  grow: 0,    size: 0.55, emoji: '🐣', name: 'Flaumküken' },
    { id: 'chick', from: 3,  grow: 0.3,  size: 0.62, emoji: '🐥', name: 'Küken' },
    { id: 'half',  from: 7,  grow: 0.6,  size: 0.7,  emoji: '🐤', name: 'Halbstark' },
    { id: 'teen',  from: 12, grow: 0.85, size: 0.8,  emoji: '🪶', name: 'Fast flügge' }
  ];
  var GROWN = { id: 'grown', emoji: '🦆', name: 'Ausgewachsen' };
  var GROWN_AT = 18;
  var BROOD_MAX = 8;
  // A family that started on the same day would grow up in lockstep, so the
  // slots start at different ages, the one right behind her the youngest.
  var BROOD_START = [0, 5, 10, 15, 3, 8, 13, 1];

  function stageOf(age) {
    var s = 0;
    for (var i = 1; i < BROOD_STAGES.length; i++) if (age >= BROOD_STAGES[i].from) s = i;
    return s;
  }

  // { ages: [days together per slot], fledged }. Missing or broken slots get
  // their starting age, so a brood from before 1.10.0 (none stored) or a
  // damaged one never shows up as NaN.
  function normBrood(brood) {
    var ages = brood && brood.ages && typeof brood.ages.length === 'number' ? brood.ages : [];
    var out = { v: 1, ages: [], fledged: count(brood && brood.fledged) };
    for (var i = 0; i < BROOD_MAX; i++) {
      var a = ages[i];
      out.ages.push(typeof a === 'number' && a >= 0 && a < 1e7 ? Math.min(Math.floor(a), GROWN_AT - 1) : BROOD_START[i]);
    }
    return out;
  }

  // One more day together for the ducklings that are out, the first `n`
  // slots. Returns the new state and the news, slot by slot: a new stage, or
  // grown up and gone (the slot starts over with a hatchling).
  function growBrood(brood, n) {
    var o = normBrood(brood), news = [];
    var out = Math.max(0, Math.min(BROOD_MAX, n | 0));
    for (var i = 0; i < out; i++) {
      var before = stageOf(o.ages[i]);
      o.ages[i] += 1;
      if (o.ages[i] >= GROWN_AT) {
        o.ages[i] = 0;
        o.fledged += 1;
        news.push({ slot: i, kind: 'fledge' });
      } else if (stageOf(o.ages[i]) !== before) {
        news.push({ slot: i, kind: 'grow', stage: stageOf(o.ages[i]) });
      }
    }
    return { brood: o, news: news };
  }

  // Autumn: leaves drift by and birds fly south from September through November.
  var AUTUMN = { season: { months: [9, 10, 11] } };

  var BY_ID = {};
  for (var i = 0; i < MODELS.length; i++) BY_ID[MODELS[i].id] = MODELS[i];

  function get(id) {
    return BY_ID[id] || BY_ID.mallard;
  }

  // Ostersonntag (gregorianisch, anonyme Gauß-Formel)
  function easterSunday(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    var mm = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * mm + 114) / 31);   // 3 = März, 4 = April
    var day = ((h + l - 7 * mm + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }

  // Saisonale Modelle sind nur in ihrem Zeitfenster verfügbar.
  // `when` ist für Tests übergebbar: eine Monatszahl (1–12) oder ein Date.
  function isAvailable(m, when) {
    if (!m.season) return true;
    if (m.season.months) {
      var mon = typeof when === 'number' ? when : ((when instanceof Date ? when : new Date()).getMonth() + 1);
      return m.season.months.indexOf(mon) !== -1;
    }
    if (m.season.easter) {
      if (typeof when === 'number') return when === 3 || when === 4;   // grobe Test-Näherung
      var now = when instanceof Date ? when : new Date();
      var es = easterSunday(now.getFullYear());
      var diff = (now - es) / 86400000;
      return diff >= -21 && diff <= 7.999;   // 3 Wochen davor bis Weißer-Sonntag-Woche
    }
    return true;
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
    isAvailable: isAvailable, easterSunday: easterSunday, BASE: BASE,
    wardrobe: WARDROBE,
    gifts: GIFTS, giftById: GIFT_BY_ID, rollGift: rollGift, giftStats: giftStats, dayKey: dayKey,
    dayNum: dayNum, daysBetween: daysBetween, isNewDay: isNewDay, countDay: countDay,
    daysOf: daysOf, streakNow: streakNow, dayStats: dayStats,
    broodStages: BROOD_STAGES, grown: GROWN, grownAt: GROWN_AT,
    stageOf: stageOf, normBrood: normBrood, growBrood: growBrood,
    leavesInSeason: function (when) { return isAvailable(AUTUMN, when); },
    birdsInSeason: function (when) { return isAvailable(AUTUMN, when); }
  };
})(typeof window !== 'undefined' ? window : this);
