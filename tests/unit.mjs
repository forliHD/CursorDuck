// Logic that needs no browser: catalog, gift draw, season, strings.
//   node tests/unit.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const sandbox = { Math, Date };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('src', 'models.js'), sandbox);
const M = sandbox.DuckModels;

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

const en = JSON.parse(read('_locales', 'en', 'messages.json'));
const de = JSON.parse(read('_locales', 'de', 'messages.json'));
const popup = read('popup', 'popup.js');
const manifest = JSON.parse(read('manifest.json'));

test('season: leaves from September through November only', () => {
  for (let m = 1; m <= 12; m++) {
    assert.equal(M.leavesInSeason(m), m >= 9 && m <= 11, 'month ' + m);
  }
});

test('season: reads a Date as well, at the month boundaries', () => {
  const at = (s) => M.leavesInSeason(new sandbox.Date(s));
  assert.equal(at('2026-08-31T23:59:00'), false);
  assert.equal(at('2026-09-01T00:01:00'), true);
  assert.equal(at('2026-11-30T23:59:00'), true);
  assert.equal(at('2026-12-01T00:01:00'), false);
});

test('dayKey: local calendar day, new key right after midnight', () => {
  assert.equal(M.dayKey(new Date(2026, 10, 4, 23, 59)), '2026-11-4');
  assert.equal(M.dayKey(new Date(2026, 10, 5, 0, 0)), '2026-11-5');
  assert.equal(M.dayKey(new Date(2027, 0, 1, 0, 0)), '2027-1-1');
});

test('rollGift: every value of the random source lands on a real gift', () => {
  for (let i = 0; i <= 1000; i++) {
    const id = M.rollGift(() => Math.min(0.999999, i / 1000), {});
    assert.ok(M.giftById[id], id);
  }
  assert.ok(M.giftById[M.rollGift(() => 0.999999999, {})]);
});

test('rollGift: rarity order holds over many draws', () => {
  const n = {}, N = 300000;
  for (let i = 0; i < N; i++) {
    const id = M.rollGift(Math.random, Object.fromEntries(M.gifts.map((g) => [g.id, 1])));
    n[id] = (n[id] || 0) + 1;
  }
  const byTier = (t) => M.gifts.filter((g) => g.tier === t).reduce((s, g) => s + (n[g.id] || 0), 0) /
    M.gifts.filter((g) => g.tier === t).length;
  assert.ok(byTier('common') > byTier('uncommon'));
  assert.ok(byTier('uncommon') > byTier('rare'));
  assert.ok(byTier('rare') > byTier('epic'));
  assert.ok(byTier('epic') > byTier('legendary'));
  assert.ok((n.goldegg || 0) > 0, 'the golden egg exists');
});

test('rollGift: something not found yet is twice as likely', () => {
  const N = 400000;
  const seen = Object.fromEntries(M.gifts.filter((g) => g.id !== 'pebble').map((g) => [g.id, 1]));
  let fresh = 0, known = 0;
  for (let i = 0; i < N; i++) {
    const id = M.rollGift(Math.random, seen);
    if (id === 'pebble') fresh++;
    if (id === 'shell') known++;
  }
  assert.ok(Math.abs(fresh / known - 2) < 0.1, 'ratio ' + fresh / known);
});

test('giftStats: totals, kinds and rares from the stored collection', () => {
  assert.deepEqual({ ...M.giftStats(null) }, { giftsTotal: 0, giftKinds: 0, giftRares: 0 });
  assert.deepEqual({ ...M.giftStats({ total: 6, counts: { pebble: 3, marble: 1, coin: 1, goldegg: 1 } }) },
    { giftsTotal: 6, giftKinds: 4, giftRares: 2 });
});

test('catalog: 14 gifts, unique ids, only known tiers', () => {
  assert.equal(M.gifts.length, 14);
  assert.equal(new Set(M.gifts.map((g) => g.id)).size, 14);
  for (const g of M.gifts) assert.ok(['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(g.tier), g.id);
});

test('locales: both files hold the same keys', () => {
  const a = Object.keys(en).sort(), b = Object.keys(de).sort();
  assert.deepEqual(a.filter((k) => !b.includes(k)), []);
  assert.deepEqual(b.filter((k) => !a.includes(k)), []);
});

test('locales: every gift has a name and a line in both languages', () => {
  for (const g of M.gifts) {
    for (const key of ['gift_' + g.id, 'giftD_' + g.id]) {
      assert.ok(en[key] && de[key], key);
    }
  }
});

test('locales: every achievement has a name and a description in both languages', () => {
  const list = popup.slice(popup.indexOf('var ACHIEVEMENTS = ['), popup.indexOf('\n  ];', popup.indexOf('var ACHIEVEMENTS = [')));
  const keys = [...list.matchAll(/^\s+\['\w+', [^,]+, '[^']+', '(\w+)',/gm)].map((m) => m[1]);
  assert.equal(keys.length, 72, 'achievement count');
  assert.equal(new Set(keys).size, 72, 'duplicates');
  for (const k of keys) {
    assert.ok(en[k] && de[k], k);
    assert.ok(en[k + 'D'] && de[k + 'D'], k + 'D');
  }
});

test('locales: every wardrobe piece and trick button has a label', () => {
  for (const w of M.wardrobe) {
    assert.ok(en['wear_' + w.id] && de['wear_' + w.id], w.id);
    assert.ok(popup.includes("'" + w.ach + "'"), 'lock points at a real achievement: ' + w.ach);
  }
  for (const m of popup.matchAll(/\['(\w+)', '[^']+', '[^']+'\]/g)) {
    assert.ok(en['trick_' + m[1]] && de['trick_' + m[1]], m[1]);
  }
});

test('update page: every string it uses exists in both locales', () => {
  for (const file of ['update.html', 'welcome.html']) {
    for (const m of read('welcome', file).matchAll(/data-i18n="(\w+)"/g)) {
      assert.ok(en[m[1]] && de[m[1]], file + ': ' + m[1]);
    }
  }
});

test('version: 1.9.0 everywhere the release needs it', () => {
  assert.equal(manifest.version, '1.9.0');
  const log = JSON.parse(read('site', 'releases.json'));
  assert.equal(log[0].version, '1.9.0');
  assert.equal(log[0].items.en.length, log[0].items.de.length);
});

test('numbers in the copy match the code', () => {
  const site = read('site', 'index.html'), siteDe = read('site', 'de.json'), readme = read('README.md');
  const hats = M.wardrobe.filter((w) => w.kind === 'hat').length;
  assert.equal(hats, 16);
  for (const s of [site, siteDe, readme]) assert.ok(s.includes('72 '), 'achievement count in the copy');
  assert.ok(site.includes('16 hats') && siteDe.includes('16 Hüte') && readme.includes('16 hats'));
  assert.ok(readme.includes('20 buttons'));
  assert.ok(en.uF5t.message.includes('72') && de.uF5t.message.includes('72'));
});

test('permissions: nothing new was asked for', () => {
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab']);
  assert.equal(manifest.host_permissions, undefined);
});

console.log(`\nunit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
