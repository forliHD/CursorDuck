// Logic that needs no browser: catalog, gift draw, seasons, the day counter,
// the ducklings' growth, migration, strings.
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
vm.runInContext(read('src', 'render.js'), sandbox);
const M = sandbox.DuckModels;
const R = sandbox.DuckRender;

// The sandbox shares this process's Date, so the time zone follows process.env.TZ.
const HOME_TZ = process.env.TZ;
function inZone(tz, fn) {
  process.env.TZ = tz;
  try { return fn(); } finally {
    if (HOME_TZ === undefined) delete process.env.TZ; else process.env.TZ = HOME_TZ;
  }
}
// plain copies: objects from the sandbox have another realm's prototypes
const plain = (o) => JSON.parse(JSON.stringify(o));

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
  assert.equal(keys.length, 76, 'achievement count');
  assert.equal(new Set(keys).size, 76, 'duplicates');
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

test('version: 1.10.0 everywhere the release needs it', () => {
  assert.equal(manifest.version, '1.10.0');
  const log = JSON.parse(read('site', 'releases.json'));
  assert.equal(log[0].version, '1.10.0');
  assert.equal(log[1].version, '1.9.0', 'the entry before it is untouched');
  assert.equal(log[0].items.en.length, log[0].items.de.length);
  // the duck log entry is the update page, word for word
  for (const loc of ['en', 'de']) {
    const msgs = loc === 'en' ? en : de;
    assert.equal(log[0].title[loc], msgs.uLogTitle.message);
    log[0].items[loc].forEach((item, i) => {
      assert.equal(item, msgs['uF' + (i + 1) + 'b'].message + ' ' + msgs['uF' + (i + 1) + 't'].message, loc + ' item ' + (i + 1));
    });
    assert.equal(msgs['uF' + (log[0].items[loc].length + 1) + 'b'], undefined, 'no leftover item from the last release');
  }
});

test('numbers in the copy match the code', () => {
  const site = read('site', 'index.html'), siteDe = read('site', 'de.json'), readme = read('README.md');
  const hats = M.wardrobe.filter((w) => w.kind === 'hat').length;
  assert.equal(hats, 16);
  const tricks = [...popup.slice(popup.indexOf('var TRICKS = ['), popup.indexOf('\n  ];', popup.indexOf('var TRICKS = [')))
    .matchAll(/\['[a-z]+', '/g)].length;
  assert.equal(tricks, 21);
  for (const s of [site, siteDe, readme]) {
    assert.ok(s.includes('76 '), 'achievement count in the copy');
    assert.ok(!/\b72 (badges|Abzeichen|achievements)/.test(s), 'the old count is gone');
  }
  assert.ok(site.includes('16 hats') && siteDe.includes('16 Hüte') && readme.includes('16 hats'));
  assert.ok(readme.includes('21 buttons'));
  assert.ok(site.includes('id="statAch">76<') && site.includes('id="statTricks">21<'));
  assert.ok(en.uF4t.message.includes('76') && de.uF4t.message.includes('76'));
  // the copy names the length of a duckling's childhood
  for (const s of [site, siteDe, readme, en.uF2t.message, de.uF2t.message]) {
    assert.ok(s.includes(M.grownAt + ' days') || s.includes(M.grownAt + ' Tagen'), 'days until grown up');
  }
});

test('permissions: nothing new was asked for', () => {
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab']);
  assert.equal(manifest.host_permissions, undefined);
});

// ── Autumn ──────────────────────────────────────────────────────────────

test('season: birds from September through November, like the leaves', () => {
  for (let m = 1; m <= 12; m++) assert.equal(M.birdsInSeason(m), m >= 9 && m <= 11, 'month ' + m);
  const at = (s) => M.birdsInSeason(new sandbox.Date(s));
  assert.equal(at('2026-08-31T23:59:59'), false);
  assert.equal(at('2026-09-01T00:00:00'), true);
  assert.equal(at('2026-11-13T12:00:00'), true, 'today, in November');
  assert.equal(at('2026-11-30T23:59:59'), true);
  assert.equal(at('2026-12-01T00:00:00'), false);
  assert.equal(at('2027-02-15T12:00:00'), false);
});

test('season: the window follows the local month in every time zone', () => {
  // the same instant, still August in Los Angeles and already September in Tokyo
  const t = Date.UTC(2026, 7, 31, 20, 0);
  assert.equal(inZone('America/Los_Angeles', () => M.birdsInSeason(new Date(t))), false);
  assert.equal(inZone('Asia/Tokyo', () => M.birdsInSeason(new Date(t))), true);
});

// ── Days together ───────────────────────────────────────────────────────

// A run of visits, one per day key, starting from `days` (a record or null).
function visit(days, ...keys) {
  let o = days;
  for (const k of keys) o = M.countDay(o, k, 0) || o;
  return plain(M.daysOf(o));
}
const NOON = (y, m, d) => new Date(y, m - 1, d, 12).getTime();

test('days: dayNum counts calendar days, across months, years and leap days', () => {
  assert.equal(M.daysBetween('2026-11-13', '2026-11-14'), 1);
  assert.equal(M.daysBetween('2026-10-31', '2026-11-1'), 1, 'month end');
  assert.equal(M.daysBetween('2026-11-30', '2026-12-1'), 1, '30-day month');
  assert.equal(M.daysBetween('2026-12-31', '2027-1-1'), 1, 'year end');
  assert.equal(M.daysBetween('2027-2-28', '2027-3-1'), 1, 'no leap day in 2027');
  assert.equal(M.daysBetween('2028-2-28', '2028-2-29'), 1, 'leap day');
  assert.equal(M.daysBetween('2028-2-28', '2028-3-1'), 2, 'leap year');
  assert.equal(M.daysBetween('2026-11-13', '2027-11-13'), 365);
  assert.equal(M.daysBetween('2026-11-14', '2026-11-13'), -1);
  // zero-padded keys read the same
  assert.equal(M.daysBetween('2026-01-05', '2026-1-6'), 1);
});

test('days: dayNum refuses anything that is not a date', () => {
  for (const bad of ['', 'x', '2026-11', '2026-13-1', '2026-0-5', '2026-11-32', '1800-1-1', 'a-b-c', null, undefined, 20261113]) {
    assert.ok(Number.isNaN(M.dayNum(bad)), String(bad));
  }
});

test('days: the first day ever starts the streak at one', () => {
  assert.deepEqual(plain(M.countDay(null, '2026-11-13', 5)), { v: 1, last: '2026-11-13', at: 5, streak: 1, best: 1, total: 1 });
});

test('days: a day counts once, however often it is asked', () => {
  const o = M.countDay(null, '2026-11-13', 0);
  assert.equal(M.countDay(o, '2026-11-13', 0), null);
  assert.equal(M.countDay(o, '2026-11-13', 0), null);
  assert.deepEqual(visit(null, '2026-11-13', '2026-11-13', '2026-11-13'), { v: 1, last: '2026-11-13', at: 0, streak: 1, best: 1, total: 1 });
});

test('days: day after day the streak grows, record and total with it', () => {
  const o = visit(null, '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16');
  assert.deepEqual([o.streak, o.best, o.total, o.last], [4, 4, 4, '2026-11-16']);
});

test('days: a missed day ends the streak, never the record or the total', () => {
  let o = visit(null, '2026-11-10', '2026-11-11', '2026-11-12');
  o = visit(o, '2026-11-14');                       // the 13th is missing
  assert.deepEqual([o.streak, o.best, o.total], [1, 3, 4]);
  o = visit(o, '2026-11-15', '2026-11-16');
  assert.deepEqual([o.streak, o.best, o.total], [3, 3, 6]);
  o = visit(o, '2026-11-17');
  assert.deepEqual([o.streak, o.best, o.total], [4, 4, 7], 'a new record');
  o = visit(o, '2027-3-1');                         // months away
  assert.deepEqual([o.streak, o.best, o.total], [1, 4, 8]);
});

test('days: the streak runs through month ends, the year end and a leap day', () => {
  let o = visit(null, '2026-10-30', '2026-10-31', '2026-11-1', '2026-11-2');
  assert.equal(o.streak, 4, 'October into November');
  o = visit(null, '2026-11-29', '2026-11-30', '2026-12-1');
  assert.equal(o.streak, 3, 'a 30-day month');
  o = visit(null, '2026-12-30', '2026-12-31', '2027-1-1', '2027-1-2');
  assert.equal(o.streak, 4, 'New Year');
  o = visit(null, '2027-2-27', '2027-2-28', '2027-3-1');
  assert.equal(o.streak, 3, 'February without a leap day');
  o = visit(null, '2028-2-28', '2028-2-29', '2028-3-1');
  assert.equal(o.streak, 3, 'February with one');
  o = visit(null, '2028-2-28', '2028-3-1');
  assert.equal(o.streak, 1, 'and the leap day can be missed like any other');
});

test('days: a whole year, day by day, in a zone with clock changes', () => {
  inZone('Europe/Berlin', () => {
    let o = null;
    for (let i = 0; i < 366; i++) {
      // late evening and just after midnight on alternating days: the hard cases
      const d = new Date(2026, 10, 13 + i, i % 2 ? 23 : 0, i % 2 ? 58 : 1);
      const next = M.countDay(o, M.dayKey(d), d.getTime());
      assert.ok(next, 'day ' + i + ' (' + M.dayKey(d) + ') counted');
      assert.equal(next.streak, i + 1, M.dayKey(d));
      o = next;
    }
    assert.equal(o.total, 366);
  });
});

test('days: the 23-hour and the 25-hour day each count as one', () => {
  for (const tz of ['Europe/Berlin', 'America/New_York', 'Australia/Sydney']) {
    inZone(tz, () => {
      for (let i = 0; i < 400; i++) {
        // two visits 22 hours and 26 hours apart never skip or repeat a calendar day by themselves
        const a = new Date(2026, 9, 1 + i, 23, 30), b = new Date(2026, 9, 2 + i, 0, 30), c = new Date(2026, 9, 2 + i, 23, 30);
        assert.equal(M.daysBetween(M.dayKey(a), M.dayKey(b)), 1, tz + ' ' + a);
        assert.equal(M.daysBetween(M.dayKey(b), M.dayKey(c)), 0, tz + ' ' + b);
      }
    });
  }
  inZone('Europe/Berlin', () => {
    // 25 October 2026: clocks go back, the day has 25 hours. One day, not two.
    const before = new Date(2026, 9, 24, 23, 50), early = new Date(2026, 9, 25, 0, 10), late = new Date(2026, 9, 25, 23, 50), after = new Date(2026, 9, 26, 0, 10);
    assert.equal((late - early) / 3600000 > 24, true, 'the test really sits on the long day');
    let o = M.countDay(null, M.dayKey(before), before.getTime());
    o = M.countDay(o, M.dayKey(early), early.getTime());
    assert.equal(o.streak, 2);
    assert.equal(M.countDay(o, M.dayKey(late), late.getTime()), null, 'same day, 23 hours and 40 minutes later');
    o = M.countDay(o, M.dayKey(after), after.getTime());
    assert.equal(o.streak, 3);
    // 28 March 2027: clocks go forward, the day has 23 hours
    const s0 = new Date(2027, 2, 27, 23, 50), s1 = new Date(2027, 2, 28, 0, 10), s2 = new Date(2027, 2, 28, 23, 50), s3 = new Date(2027, 2, 29, 0, 10);
    assert.equal((s3 - s1) / 3600000 < 24, true, 'the test really sits on the short day');
    o = M.countDay(null, M.dayKey(s0), s0.getTime());
    o = M.countDay(o, M.dayKey(s1), s1.getTime());
    assert.equal(M.countDay(o, M.dayKey(s2), s2.getTime()), null);
    o = M.countDay(o, M.dayKey(s3), s3.getTime());
    assert.equal(o.streak, 3);
  });
});

test('days: midnight is the border, a minute either side', () => {
  const a = new Date(2026, 10, 13, 23, 59), b = new Date(2026, 10, 14, 0, 0), c = new Date(2026, 10, 14, 0, 1);
  let o = M.countDay(null, M.dayKey(a), a.getTime());
  const next = M.countDay(o, M.dayKey(b), b.getTime());
  assert.equal(next.streak, 2, 'one minute later it is the next day');
  assert.equal(M.countDay(next, M.dayKey(c), c.getTime()), null);
});

test('days: flying west, the date that comes round again is not counted twice', () => {
  // counted on the 13th in Tokyo, then on to Los Angeles, where it is the 12th again
  const t0 = Date.UTC(2026, 10, 12, 23, 0);                    // 08:00 on the 13th in Tokyo
  let o = inZone('Asia/Tokyo', () => M.countDay(visit(null, '2026-11-11', '2026-11-12'), M.dayKey(new Date(t0)), t0));
  assert.deepEqual([o.last, o.streak], ['2026-11-13', 3]);
  inZone('America/Los_Angeles', () => {
    const land = new Date(t0 + 8 * 3600000);                   // 23:00 on the 12th in Los Angeles
    assert.equal(M.dayKey(land), '2026-11-12', 'back in yesterday');
    assert.equal(M.countDay(o, M.dayKey(land), land.getTime()), null);
    assert.deepEqual(plain(M.streakNow(o, M.dayKey(land))), { streak: 3, today: true }, 'the popup still shows the streak');
    const same = new Date(2026, 10, 13, 9);
    assert.equal(M.countDay(o, M.dayKey(same), same.getTime()), null, 'the 13th was counted in Tokyo');
    const next = new Date(2026, 10, 14, 9);
    o = M.countDay(o, M.dayKey(next), next.getTime());
    assert.deepEqual([o.last, o.streak, o.total], ['2026-11-14', 4, 4], 'and the run goes on');
  });
});

test('days: flying east, a date nobody lived through does not end the streak', () => {
  // the evening of the 12th in Los Angeles, twelve hours later the small hours of the 14th in Tokyo
  const t0 = Date.UTC(2026, 10, 13, 6, 0);                     // 22:00 on the 12th in Los Angeles
  let o = inZone('America/Los_Angeles', () => M.countDay(visit(null, '2026-11-10', '2026-11-11'), M.dayKey(new Date(t0)), t0));
  assert.deepEqual([o.last, o.streak], ['2026-11-12', 3]);
  inZone('Asia/Tokyo', () => {
    const land = new Date(t0 + 12 * 3600000);
    assert.equal(M.dayKey(land), '2026-11-14', 'the 13th never happened for the traveller');
    assert.deepEqual(plain(M.streakNow(o, M.dayKey(land))), { streak: 3, today: false }, 'still alive in the popup');
    const next = M.countDay(o, M.dayKey(land), land.getTime());
    assert.deepEqual([next.last, next.streak, next.total], ['2026-11-14', 4, 4]);
    // the same evening a day later in Tokyo is still within reach: in Tokyo's calendar the last visit was on the 13th
    const evening = new Date(2026, 10, 14, 21);
    assert.equal(M.countDay(o, M.dayKey(evening), evening.getTime()).streak, 4);
    // but a day really missed after landing ends it
    const late = new Date(2026, 10, 15, 9);
    assert.equal(M.countDay(o, M.dayKey(late), late.getTime()).streak, 1);
  });
});

test('days: at home the moment of the last visit changes nothing', () => {
  // without a change of zone, a skipped date is a missed day, however few hours lay between
  const a = new Date(2026, 10, 12, 23, 59), b = new Date(2026, 10, 14, 0, 1);
  const o = M.countDay(visit(null, '2026-11-11'), M.dayKey(a), a.getTime());
  assert.equal(o.streak, 2);
  const next = M.countDay(o, M.dayKey(b), b.getTime());
  assert.equal(next.streak, 1, '24 hours and two minutes, and the 13th is missing');
  assert.equal(next.best, 2);
});

test('days: a clock that was set wrong recovers', () => {
  let o = visit(null, '2026-11-11', '2026-11-12', '2026-11-13');
  // the clock jumps a year ahead and one day gets counted there
  o = visit(o, '2027-11-13');
  assert.deepEqual([o.last, o.streak, o.best, o.total], ['2027-11-13', 1, 3, 4]);
  // set right again: today starts afresh instead of waiting a year for the date to catch up
  const back = M.countDay(o, '2026-11-14', 0);
  assert.deepEqual([back.last, back.streak, back.best, back.total], ['2026-11-14', 1, 3, 5]);
  // a clock a day or two ahead is treated like a trip west: nothing counted twice, nothing lost
  o = visit(null, '2026-11-12', '2026-11-13', '2026-11-15');
  assert.equal(M.countDay(o, '2026-11-14', 0), null);
  assert.equal(M.countDay(o, '2026-11-13', 0), null);
  assert.equal(M.countDay(o, '2026-11-16', 0).streak, 2);
});

test('days: damaged records and dates read as nothing, never as NaN', () => {
  for (const bad of [null, undefined, {}, [], 'x', 7, { streak: 'many', best: -3, total: NaN, last: 5, at: 'now' }, { streak: 1e12 }]) {
    const o = plain(M.daysOf(bad));
    assert.deepEqual(o, { v: 1, last: '', at: 0, streak: 0, best: 0, total: 0 }, JSON.stringify(bad));
    assert.equal(M.countDay(bad, '2026-11-13', 0).streak, 1);
  }
  const o = M.countDay(null, '2026-11-13', 0);
  for (const bad of ['', 'tomorrow', '2026-11', null, undefined, '2026-13-40']) {
    assert.equal(M.countDay(o, bad, 0), null, String(bad));
  }
  // a record whose parts disagree is levelled out
  assert.deepEqual(plain(M.daysOf({ streak: 9, best: 2, total: 1, last: '2026-11-13' })), { v: 1, last: '2026-11-13', at: 0, streak: 9, best: 9, total: 9 });
  assert.equal(M.countDay(o, '2026-11-14', -5).at, 0, 'no moment, no time zone help, nothing worse');
});

test('days: the test switch adds a day without moving the date', () => {
  let o = M.countDay(null, '2026-11-13', NOON(2026, 11, 13));
  const forced = M.countDay(o, '2026-11-13', 1, true);
  assert.deepEqual([forced.streak, forced.best, forced.total, forced.last, forced.at], [2, 2, 2, '2026-11-13', NOON(2026, 11, 13)]);
  const again = M.countDay(forced, '2026-11-13', 1, true);
  assert.equal(again.streak, 3);
  assert.equal(M.countDay(again, '2026-11-13', 1), null, 'the real day is still counted only once');
  assert.equal(M.countDay(again, '2026-11-14', 1).streak, 4, 'and tomorrow counts as tomorrow');
});

test('days: streakNow tells the popup where the run stands today', () => {
  const o = visit(null, '2026-11-11', '2026-11-12', '2026-11-13');
  assert.deepEqual(plain(M.streakNow(o, '2026-11-13')), { streak: 3, today: true });
  assert.deepEqual(plain(M.streakNow(o, '2026-11-14')), { streak: 3, today: false }, 'yesterday: it can still grow');
  assert.deepEqual(plain(M.streakNow(o, '2026-11-15')), { streak: 0, today: false }, 'a day missed: over');
  assert.deepEqual(plain(M.streakNow(null, '2026-11-13')), { streak: 0, today: false });
  assert.deepEqual(plain(M.streakNow(o, 'nonsense')), { streak: 0, today: false });
  assert.deepEqual(plain(M.dayStats(visit(o, '2026-11-20'))), { streakDays: 3, daysTotal: 4 }, 'the badges keep the record');
});

test('days: the gift follows the same calendar', () => {
  assert.equal(M.isNewDay('', '2026-11-13'), true, 'never had one');
  assert.equal(M.isNewDay('2026-11-13', '2026-11-13'), false);
  assert.equal(M.isNewDay('2026-11-13', '2026-11-14'), true);
  assert.equal(M.isNewDay('2026-11-13', '2026-11-12'), false, 'a trip west');
  assert.equal(M.isNewDay('2026-11-13', '2026-11-11'), false);
  assert.equal(M.isNewDay('2026-11-13', '2026-11-10'), true, 'the clock was wrong');
  assert.equal(M.isNewDay('x', '2026-11-13'), true, 'the 1.9.0 tests wrote “x” here');
  assert.equal(M.isNewDay('2026-12-31', '2027-1-1'), true);
  // a day that is not a date is nobody's new day, whatever is stored
  for (const bad of ['', 'tomorrow', '2026-11', '2026-13-40', null, undefined]) {
    assert.equal(M.isNewDay('2026-11-13', bad), false, String(bad));
    assert.equal(M.isNewDay('', bad), false, String(bad));
  }
});

// ── Migration from 1.9.0 ────────────────────────────────────────────────

test('migration: the old streak carries over and goes on the next day', () => {
  // 1.9.0 kept it in the play counters; `days` and `brood` did not exist
  const stats = { pets: 40, pecks: 3, streakDays: 12, streakLast: '2026-11-12' };
  const gifts = { last: '2026-11-12', total: 8, counts: { pebble: 8 } };
  const o = plain(M.daysOf(null, stats, gifts));
  assert.deepEqual(o, { v: 1, last: '2026-11-12', at: 0, streak: 12, best: 12, total: 12 });
  const next = M.countDay(o, '2026-11-13', 0);
  assert.deepEqual([next.streak, next.best, next.total], [13, 13, 13]);
});

test('migration: updated on a day 1.9.0 had counted already, nothing is counted twice', () => {
  const o = M.daysOf(null, { streakDays: 5, streakLast: '2026-11-13' }, null);
  assert.equal(M.countDay(o, '2026-11-13', 0), null);
  assert.deepEqual(plain(M.streakNow(o, '2026-11-13')), { streak: 5, today: true });
});

test('migration: a streak that was broken before the update starts over, the old one is the record', () => {
  const o = M.daysOf(null, { streakDays: 20, streakLast: '2026-10-1' }, { total: 31 });
  assert.equal(plain(o).total, 31, 'more gifts than streak days: those were days together too');
  const next = M.countDay(o, '2026-11-13', 0);
  assert.deepEqual([next.streak, next.best, next.total], [1, 20, 32]);
});

test('migration: no counters at all, or broken ones, give an empty record', () => {
  for (const stats of [null, undefined, {}, { pets: 3 }, { streakDays: 'x', streakLast: 12 }, { streakDays: -1 }]) {
    assert.deepEqual(plain(M.daysOf(null, stats, null)), { v: 1, last: '', at: 0, streak: 0, best: 0, total: 0 });
  }
  // a stored record wins over the old counters once it exists
  assert.equal(plain(M.daysOf({ streak: 2, last: '2026-11-13' }, { streakDays: 30, streakLast: '2026-11-13' })).streak, 2);
});

test('migration: ducklings from before the update get the starting family', () => {
  const b = plain(M.normBrood(null));
  assert.equal(b.ages.length, 8);
  assert.equal(b.ages[0], 0, 'the one right behind her is still the fluffball she was');
  assert.equal(b.fledged, 0);
  assert.equal(new Set(b.ages).size, 8, 'no two start at the same age');
  for (const a of b.ages) assert.ok(a >= 0 && a < M.grownAt);
});

// ── Ducklings that grow up ──────────────────────────────────────────────

test('growth: four stages, each bigger and more like mama, names in both languages', () => {
  const st = M.broodStages;
  assert.equal(st.length, 4);
  assert.equal(st[0].from, 0);
  for (let i = 1; i < st.length; i++) {
    assert.ok(st[i].from > st[i - 1].from && st[i].grow > st[i - 1].grow && st[i].size > st[i - 1].size, st[i].id);
  }
  assert.ok(st[st.length - 1].from < M.grownAt && st[st.length - 1].size < 1 && st[st.length - 1].grow < 1);
  assert.equal(st[0].size, 0.55, 'the fluffball is the size the ducklings always were');
  for (const s of [...st, M.grown]) assert.ok(en['stage_' + s.id] && de['stage_' + s.id], s.id);
});

test('growth: stageOf at every border', () => {
  const want = { 0: 0, 2: 0, 3: 1, 6: 1, 7: 2, 11: 2, 12: 3, 17: 3 };
  for (const [age, stage] of Object.entries(want)) assert.equal(M.stageOf(+age), stage, 'age ' + age);
});

test('growth: only the ducklings that are out grow', () => {
  const g = M.growBrood({ ages: [0, 0, 0, 0, 0, 0, 0, 0] }, 3);
  assert.deepEqual(plain(g.brood.ages), [1, 1, 1, 0, 0, 0, 0, 0]);
  assert.deepEqual(plain(g.news), []);
  assert.deepEqual(plain(M.growBrood({ ages: [5, 5] }, 0).brood.ages).slice(0, 2), [5, 5]);
  assert.deepEqual(plain(M.growBrood({ ages: [5, 5] }, -3).brood.ages).slice(0, 2), [5, 5]);
  assert.equal(plain(M.growBrood(null, 99).brood.ages).length, 8, 'never more than there are slots');
});

test('growth: a whole childhood, day by day', () => {
  let brood = { ages: [0], fledged: 0 };
  const log = [];
  for (let day = 1; day <= M.grownAt; day++) {
    const g = M.growBrood(brood, 1);
    brood = g.brood;
    for (const n of g.news) log.push(day + ':' + n.kind + (n.kind === 'grow' ? M.broodStages[n.stage].id : ''));
  }
  assert.deepEqual(log, ['3:growchick', '7:growhalf', '12:growteen', '18:fledge']);
  assert.equal(brood.ages[0], 0, 'a new fluffball in her place');
  assert.equal(brood.fledged, 1);
  // and the next one takes just as long
  for (let day = 1; day < M.grownAt; day++) brood = M.growBrood(brood, 1).brood;
  assert.equal(brood.fledged, 1);
  assert.equal(M.growBrood(brood, 1).brood.fledged, 2);
});

test('growth: the starting family never sends two out into the world on one day', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 8]) {
    let brood = null, most = 0, total = 0;
    for (let day = 0; day < 365; day++) {
      const g = M.growBrood(brood, n);
      brood = g.brood;
      const gone = g.news.filter((x) => x.kind === 'fledge').length;
      most = Math.max(most, gone);
      total += gone;
    }
    assert.equal(most, 1, n + ' ducklings');
    assert.equal(total, brood.fledged);
    assert.ok(total >= Math.floor(365 / M.grownAt) * n, n + ' ducklings: ' + total + ' grew up in a year');
  }
});

test('growth: damaged broods are mended, slot by slot', () => {
  const def = plain(M.normBrood(null).ages);
  assert.deepEqual(plain(M.normBrood({ ages: 'x' }).ages), def);
  assert.deepEqual(plain(M.normBrood({ ages: [] }).ages), def);
  assert.deepEqual(plain(M.normBrood({ ages: [4, null, -1, 'a', NaN, 2.9, 999, 7] }).ages), [4, def[1], def[2], def[3], def[4], 2, M.grownAt - 1, 7]);
  assert.equal(plain(M.normBrood({ fledged: 'lots' })).fledged, 0);
  assert.equal(plain(M.normBrood({ ages: [1], fledged: 3.7 })).fledged, 3);
  // growing a mended brood gives whole numbers again
  for (const a of plain(M.growBrood({ ages: [NaN, 'x', 5.5] }, 8).brood.ages)) assert.ok(Number.isInteger(a) && a >= 0 && a < M.grownAt);
});

test('growth: the fluffball looks as the ducklings always did, the fledgling like mama', () => {
  for (const m of M.list) {
    const b = R.babyOf(m), b0 = R.babyOf(m, 0), g = R.babyOf(m, 1);
    assert.deepEqual(plain(b), plain(b0), m.id);
    // what 1.9.0 drew
    assert.equal(b.scale, (m.scale || 1) * 0.95);
    assert.equal(b.headR, m.headR * 1.24);
    assert.equal(b.neckLen, m.neckLen * 0.5);
    assert.equal(b.beakLen, m.beakLen * 0.78);
    assert.equal(b.quackPitch, (m.quackPitch || 1) * 1.75);
    assert.equal(b.body, R.mix('#ffe066', m.body, 0.22));
    assert.equal(b.head, R.mix('#ffe884', m.head, 0.18));
    assert.deepEqual([b.hat, b.glasses, b.crest, b.neckRing, b.cheek], [null, null, null, null, null]);
    // grown: mama's build, never her hat or glasses
    assert.ok(Math.abs(g.scale - (m.scale || 1)) < 1e-9 && Math.abs(g.neckLen - m.neckLen) < 1e-9 && Math.abs(g.headR - m.headR) < 1e-9, m.id);
    assert.deepEqual([g.hat, g.glasses], [null, null]);
    assert.equal(g.neckRing, m.neckRing);
    // and every stage in between is somewhere between the two
    let last = b.neckLen;
    for (const st of M.broodStages) {
      const s = R.babyOf(m, st.grow);
      assert.ok(s.neckLen >= last - 1e-9 && s.neckLen <= m.neckLen + 1e-9, m.id + ' ' + st.id);
      last = s.neckLen;
    }
  }
});

// ── Wiring ──────────────────────────────────────────────────────────────

test('wiring: one message for the day, the same name on both ends', () => {
  const bg = read('src', 'background.js'), cs = read('src', 'content.js'), bridge = read('tests', 'bridge.js');
  assert.ok(bg.includes("msg.type !== 'duck:day'"));
  assert.ok(cs.includes("type: 'duck:day'") && popup.includes("type: 'duck:day'") && bridge.includes("type: 'duck:day'"));
  for (const src of [bg, cs, popup, bridge]) assert.ok(!src.includes('duck:gift'), 'the 1.9.0 message name is gone');
  // the old streak code is gone from the content script; the background reads the old counters once
  assert.ok(!cs.includes('streakDays') && !cs.includes('streakLast'));
  assert.ok(bg.includes('DuckModels.daysOf(o.days, o.stats, o.gifts)'));
});

test('wiring: the day, the brood and the gift go through one queue', () => {
  const bg = read('src', 'background.js');
  assert.equal([...bg.matchAll(/chrome\.runtime\.onMessage\.addListener/g)].length, 1);
  assert.ok(/dayQueue = run\.catch/.test(bg) && /dayQueue\.then/.test(bg));
  for (const call of ['DuckModels.countDay(', 'DuckModels.growBrood(', 'DuckModels.isNewDay(', 'DuckModels.rollGift(']) assert.ok(bg.includes(call), call);
});

console.log(`\nunit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
