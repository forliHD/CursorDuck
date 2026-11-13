// Drives the packaged extension in real browsers.
//   node tests/e2e.mjs chrome|firefox [name filter]
// Tests the zip from dist/ plus the test bridge. The clock, season and day
// change are moved through the bridge, in the world the content scripts run in.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const BROWSER = process.argv[2] || 'chrome';
const FILTER = process.argv[3] || '';
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;
const FIREFOX = BROWSER === 'firefox';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── test copy of the package: the shipped zip, plus the bridge ──────────
function testPackage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-duck-e2e-'));
  const zip = path.join(ROOT, 'dist', `cursor-duck-${FIREFOX ? 'firefox' : 'chrome'}-${VERSION}.zip`);
  execFileSync('unzip', ['-q', zip, '-d', dir]);
  fs.copyFileSync(path.join(HERE, 'bridge.js'), path.join(dir, 'src', 'test-bridge.js'));
  const mf = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  mf.content_scripts[0].js.unshift('src/test-bridge.js');
  if (FIREFOX) {
    // WebDriver BiDi won't navigate to moz-extension:// URLs, the extension itself can
    fs.writeFileSync(path.join(dir, 'src', 'test-bg.js'),
      "chrome.runtime.onMessage.addListener(function (m, s, r) {\n" +
      "  if (!m || m.type !== 'test:open') return undefined;\n" +
      "  chrome.tabs.update(s.tab.id, { url: chrome.runtime.getURL(m.path) });\n" +
      "  return undefined;\n" +
      "});\n");
    mf.background.scripts.push('src/test-bg.js');
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(mf, null, 2));
  return dir;
}

// An extension page in a tab of its own.
async function openExtPage(from, rel) {
  const url = await duck(from, 'getURL', rel);
  let p;
  if (FIREFOX) {
    // the same tab goes there, asked from inside the extension
    p = from;
    await duck(from, 'openExt', rel);
    await until(() => p.evaluate(() => location.href).then((h) => h === url).catch(() => false), 'the extension page', 5000, 120);
  } else {
    p = await browser.newPage();
    await p.goto(url, { waitUntil: 'load' });
  }
  openPages.add(p);
  if (p !== from) {
    p.errors = [];
    p.on('pageerror', (e) => p.errors.push(String(e)));
  }
  await p.bringToFront().catch(() => {});
  return p;
}

function serve(root = path.join(HERE, 'fixtures')) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      let rel = path.normalize(url.pathname).replace(/^\/+/, '');
      if (rel === '' || rel.endsWith('/')) rel += root.endsWith('fixtures') ? 'page.html' : 'index.html';
      const file = path.join(root, rel);
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end(); return; }
        const type = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.png': 'image/png' }[path.extname(file)] || 'text/html; charset=utf-8';
        res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// ── plumbing ────────────────────────────────────────────────────────────
async function duck(page, cmd, ...args) {
  const raw = await page.evaluate((c, a, limit) => new Promise((resolve, reject) => {
    const id = Math.random();
    const t = setTimeout(() => { window.removeEventListener('message', on); reject(new Error('bridge timeout: ' + c)); }, limit);
    function on(ev) {
      if (!ev.data || ev.data.__duckTestReply !== id) return;
      window.removeEventListener('message', on);
      clearTimeout(t);
      resolve(ev.data.value);
    }
    window.addEventListener('message', on);
    window.postMessage({ __duckTest: id, cmd: c, args: a }, '*');
  }), cmd, args, cmd === 'soak' ? 120000 : 5000);
  const v = JSON.parse(raw);
  if (v && v.__error) throw new Error(cmd + ': ' + v.__error);
  return v;
}
const state = (page) => duck(page, 'state');

async function until(fn, what, ms = 8000, step = 60) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await sleep(step);
  }
  throw new Error('timed out waiting for ' + what);
}

const CALM = {
  enabled: true, follow: true, peck: false, playfulness: 0, ducklings: 0, feed: true, escHide: true,
  effects: true, sound: false, disabledHosts: [], sleepAfter: 60, distance: 1, size: 1, model: 'mallard'
};

let browser, base, siteBase;
const openPages = new Set();

// A fresh page with a quiet duck. Today's gift is out of the way unless a test wants it.
async function open(opts = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 720, hasTouch: !!opts.touch }).catch(() => {});
  openPages.add(page);
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.goto(base + (opts.path || '/page.html') + (opts.hash || ''), { waitUntil: 'load' });
  await until(() => page.evaluate(() => document.documentElement.getAttribute('data-duck-bridge') === '1'), 'bridge');
  await until(() => state(page), 'engine');
  await duck(page, 'storageSet', 'sync', { ...CALM, ...(opts.cfg || {}) });
  await duck(page, 'storageSet', 'local', { stats: { pets: 0, pecks: 0 } });
  // today's gift stays out of every test that doesn't ask for it: a real claim
  // arrives after 3 s and would walk through whatever the test is looking at
  if (!opts.claims) await noGiftToday(page);
  await until(async () => { const s = await state(page); return s.cfg.playfulness === (opts.cfg?.playfulness ?? 0); }, 'settings to arrive');
  await page.bringToFront().catch(() => {});
  return page;
}
async function close(page) { openPages.delete(page); await page.close().catch(() => {}); }

// Park the cursor, then let her settle next to it.
async function settle(page, x = 700, y = 450) {
  await page.mouse.move(x, y);
  await until(async () => {
    const s = await state(page);
    // stopped, not just near: a glide carries her off between reading her position and the press
    return (s.state === 'idle' || s.state === 'look' || s.state === 'bob') && s.speed < 25 &&
      Math.hypot(s.x - x, s.y - y) < s.r * 3.2 ? s : null;
  }, 'her to catch up', 9000);
  return state(page);
}

// The spot on her that counts as "on her".
const onHer = (s) => ({ x: s.x, y: s.y - s.r * 0.75 });

// Today is settled: counted, and its gift is out. The content script keeps quiet if storage says so.
async function noGiftToday(page) {
  const day = await duck(page, 'today');
  await duck(page, 'storageSet', 'local', {
    gifts: { last: day, total: 0, counts: {} }, days: { last: day, streak: 1, best: 1, total: 1 }
  });
}

// What storage.local holds: the day counter, the family.
const local = async (page, keys) => duck(page, 'storageGet', 'local', keys);
const daysOf = async (page) => (await local(page, { days: null })).days;
const broodOf = async (page) => (await local(page, { brood: null })).brood;
// What 1.9.0 leaves behind: the streak in the play counters, no `days`, no `brood`.
async function as190(page, stats, gifts) {
  await duck(page, 'storageClear', 'local');
  await duck(page, 'storageSet', 'local', { stats: { pets: 3, pecks: 1, ...stats }, ...(gifts ? { gifts } : {}) });
}

const results = [];
async function test(name, fn, opts = {}) {
  if (FILTER && !name.includes(FILTER)) return;
  if (opts.chromeOnly && FIREFOX) {
    results.push({ name, skipped: true });
    console.log('  skip ' + name + ' (' + opts.why + ')');
    return;
  }
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log('  ok   ' + name + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  } catch (e) {
    results.push({ name, ok: false, error: String(e.message || e) });
    console.log('  FAIL ' + name + '\n       ' + String(e.message || e).split('\n').slice(0, 6).join('\n       '));
  }
  for (const p of [...openPages]) await close(p);
}

// ── tests ───────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n${BROWSER}: ${await browser.version()}\n`);

  console.log('Fresh install');

  await test('install: the background page fills in the defaults, Esc switch included', async () => {
    const page = await browser.newPage();
    openPages.add(page);
    await page.goto(base + '/page.html', { waitUntil: 'load' });
    await until(() => page.evaluate(() => document.documentElement.getAttribute('data-duck-bridge') === '1'), 'bridge');
    const all = await until(async () => {
      const v = await duck(page, 'storageGet', 'sync', null);
      return v && 'model' in v ? v : null;
    }, 'defaults in storage', 4000);
    assert.equal(all.escHide, true);
    assert.equal(all.randomOnStart, false);
    if (FIREFOX) {
      // BiDi lists it as about:blank, so count the tabs: blank start tab, this one, the welcome page.
      // The tab is created right after the defaults are written; give it a moment to show up.
      await until(async () => (await browser.pages()).length >= 3, 'the welcome page to open', 5000);
    } else {
      assert.ok((await browser.pages()).some((p) => p.url().endsWith('/welcome/welcome.html')), 'the welcome page opened');
    }
  });

  await test('update: going from 1.9.0 opens the update page, a patch does not', async () => {
    // the rule itself, fed the way onInstalled would feed it
    const src = fs.readFileSync(path.join(ROOT, 'src', 'background.js'), 'utf8');
    assert.ok(src.includes('prev[0] !== cur2[0] || prev[1] !== cur2[1]'));
    const opens = (prev, cur) => { const a = prev.split('.'), b = cur.split('.'); return a[0] !== b[0] || a[1] !== b[1]; };
    assert.equal(opens('1.9.0', '1.10.0'), true);
    assert.equal(opens('1.8.1', '1.10.0'), true);
    assert.equal(opens('1.10.0', '1.10.1'), false);
  });

  // Keep today's gift from walking through the tests below; the gift group sets its own days.
  {
    const p = await open();
    await noGiftToday(p);
    await close(p);
  }

  console.log('Dragging');

  await test('drag: press and pull picks her up, she follows, the page sees no drag', async () => {
    const page = await open();
    const s = await settle(page);
    const at = onHer(s);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    const before = await page.evaluate(() => ({ ...window.__log }));
    await page.mouse.move(at.x - 60, at.y - 40, { steps: 6 });
    const mid = await until(async () => { const c = await state(page); return c.state === 'dragged' ? c : null; }, 'state dragged', 2000);
    assert.equal(mid.drag.active, true);
    await page.mouse.move(at.x - 240, at.y - 120, { steps: 12 });
    await sleep(350);
    const held = await state(page);
    assert.equal(held.state, 'dragged');
    // the spot she was grabbed by stays under the cursor (the legs lift the body by walk * 0.9 r)
    const wantX = at.x - 240 + held.drag.offX, wantY = at.y - 120 + held.drag.offY + held.walk * held.r * 0.9;
    assert.ok(Math.hypot(held.x - wantX, held.y - wantY) < held.r * 0.5,
      `follows the cursor: at ${held.x},${held.y}, want ${wantX},${wantY}`);
    assert.ok(Math.hypot(held.drag.offX, held.drag.offY) < held.r * 2.2, 'and she was grabbed where the press was');
    const during = await page.evaluate(() => ({ ...window.__log, sel: String(getSelection()) }));
    assert.equal(during.sel, '', 'no text got selected');
    assert.ok(during.mousemove - before.mousemove <= 2, `page saw ${during.mousemove - before.mousemove} mouse moves`);
    await page.mouse.up();
    const after = await until(async () => { const c = await state(page); return c.state === 'dragback' ? c : null; }, 'dragback', 2000);
    assert.ok(after.home, 'knows where home is');
    assert.ok(Math.hypot(after.home.x - s.x, after.home.y - s.y) < s.r, 'home is where she was grabbed');
    const end = await page.evaluate(() => window.__log.mouseup);
    assert.ok(end > before.mouseup, 'the page got its mouseup');
    assert.deepEqual(page.errors, []);
  });

  await test('drag: after release she paddles back to where she was, then follows again', async () => {
    const page = await open();
    const s = await settle(page);
    const at = onHer(s);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x - 280, at.y - 180, { steps: 10 });
    await sleep(250);
    await page.mouse.up();
    // cursor goes elsewhere on purpose: she still goes home first
    await page.mouse.move(150, 650, { steps: 5 });
    const passed = await until(async () => {
      const c = await state(page);
      return c.state !== 'dragback' && c.state !== 'dragged' ? c : null;
    }, 'her to finish the way back', 10000);
    assert.ok(Math.hypot(passed.x - s.x, passed.y - s.y) < s.r * 2.2, `back at her spot: off by ${Math.hypot(passed.x - s.x, passed.y - s.y)}`);
    await until(async () => { const c = await state(page); return Math.hypot(c.x - 150, c.y - 650) < c.r * 4 ? c : null; }, 'her to follow again', 9000);
    const c = await state(page);
    assert.equal(c.stats.drags, 1, 'counted once');
  });

  await test('drag: a link under her is not clicked by the release', async () => {
    const page = await open();
    const box = await page.evaluate(() => { const r = document.getElementById('link').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await settle(page, box.x + 60, box.y + 60);
    const r = (await state(page)).r;
    await duck(page, 'place', box.x, box.y + r * 0.75);
    await sleep(30);
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 60, { steps: 8 });
    await sleep(150);
    await page.mouse.move(box.x + 2, box.y + 1, { steps: 6 });     // back over the link
    await page.mouse.up();
    await sleep(120);
    const log = await page.evaluate(() => ({ click: window.__log.click, hash: location.hash }));
    assert.deepEqual(log.click, [], 'no click reached the page');
    assert.equal(log.hash, '', 'no navigation');
  });

  await test('drag: a plain click on her still reaches the link underneath', async () => {
    const page = await open();
    const box = await page.evaluate(() => { const r = document.getElementById('link').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await settle(page, box.x + 60, box.y + 60);
    const r = (await state(page)).r;
    await duck(page, 'place', box.x, box.y + r * 0.75);
    await sleep(30);
    await page.mouse.click(box.x, box.y);
    await sleep(100);
    const log = await page.evaluate(() => ({ click: window.__log.click, hash: location.hash }));
    assert.deepEqual(log.click, ['link']);
    assert.equal(log.hash, '#clicked');
    const c = await state(page);
    assert.notEqual(c.state, 'dragged');
    assert.equal(c.drag, null, 'nothing left armed');
  });

  await test('drag: away from her, text selection and links work as ever', async () => {
    const page = await open();
    await settle(page, 800, 600);
    const t = await page.evaluate(() => { const r = document.getElementById('text').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page.mouse.move(t.x + 4, t.y + 12);
    await page.mouse.down();
    const before = await page.evaluate(() => window.__log.mousemove);
    await page.mouse.move(t.x + t.w * 0.8, t.y + t.h * 0.6, { steps: 10 });
    const during = await state(page);
    assert.equal(during.state === 'dragged', false, 'not grabbed');
    assert.equal(during.drag, null);
    await page.mouse.up();
    const sel = await page.evaluate(() => String(getSelection()).length);
    assert.ok(sel > 30, `selected ${sel} characters`);
    const moves = await page.evaluate(() => window.__log.mousemove);
    assert.ok(moves - before >= 5, 'page saw the mouse moves');
    await page.evaluate(() => getSelection().removeAllRanges());
    const l = await page.evaluate(() => { const r = document.getElementById('link').getBoundingClientRect(); return { x: r.left + 5, y: r.top + 5 }; });
    await page.mouse.click(l.x, l.y);
    await sleep(80);
    assert.equal(await page.evaluate(() => location.hash), '#clicked');
  });

  await test('drag: a press on her over a text field stays with the field', async () => {
    const page = await open();
    const b = await page.evaluate(() => { const r = document.getElementById('input').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 10 }; });
    await settle(page, b.x + 70, b.y + 70);
    const r = (await state(page)).r;
    await duck(page, 'place', b.x, b.y + r * 0.75);
    await sleep(30);
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    await page.mouse.move(b.x + 60, b.y, { steps: 6 });
    const c = await state(page);
    await page.mouse.up();
    assert.notEqual(c.state, 'dragged');
    assert.equal(c.drag, null);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'input');
  });

  const overText = async (page) => {
    // the middle of the first line of the paragraph, with her right on top of it
    const t = await page.evaluate(() => { const r = document.getElementById('text').getBoundingClientRect(); return { x: r.left + 200, y: r.top + 12 }; });
    await settle(page, t.x + 90, t.y + 140);
    const r = (await state(page)).r;
    await duck(page, 'place', t.x, t.y + r * 0.75);
    await sleep(30);
    return t;
  };

  await test('drag: a double-click on a word under her still selects it', async () => {
    const page = await open();
    const t = await overText(page);
    await page.mouse.click(t.x, t.y, { count: 2 });
    await sleep(60);
    const sel = await page.evaluate(() => String(getSelection()).trim());
    assert.ok(sel.length > 1 && !sel.includes(' '), `selected “${sel}”`);
    assert.equal((await state(page)).drag, null);
  });

  await test('drag: pulling her off the text leaves nothing selected', async () => {
    const page = await open();
    const t = await overText(page);
    await page.mouse.move(t.x, t.y);
    await page.mouse.down();
    await page.mouse.move(t.x + 150, t.y + 12, { steps: 12 });
    await until(async () => (await state(page)).state === 'dragged', 'dragged', 2000);
    await page.mouse.move(t.x + 320, t.y + 40, { steps: 12 });
    assert.equal(await page.evaluate(() => String(getSelection())), '', 'nothing while dragging');
    await page.mouse.up();
    await sleep(80);
    assert.equal(await page.evaluate(() => String(getSelection())), '', 'nothing after the release');
  });

  await test('drag: let go by a popup trick, the rest of the gesture still does nothing to the page', async () => {
    const page = await open();
    const box = await page.evaluate(() => { const r = document.getElementById('link').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await settle(page, box.x + 60, box.y + 60);
    const r = (await state(page)).r;
    await duck(page, 'place', box.x, box.y + r * 0.75);
    await sleep(30);
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + 20, { steps: 5 });
    await until(async () => (await state(page)).state === 'dragged', 'dragged', 2000);
    await duck(page, 'trigger', 'quack', 1);
    await sleep(150);                                    // long past the short click guard
    const t = await page.evaluate(() => { const b = document.getElementById('text').getBoundingClientRect(); return { x: b.left + 100, y: b.top + 20 }; });
    await page.mouse.move(t.x, t.y, { steps: 6 });
    assert.equal(await page.evaluate(() => String(getSelection())), '', 'no selection');
    await page.mouse.move(box.x, box.y, { steps: 6 });
    await page.mouse.up();
    await sleep(120);
    const log = await page.evaluate(() => ({ click: window.__log.click, hash: location.hash }));
    assert.deepEqual(log.click, [], 'no click');
    assert.equal(log.hash, '');
  });

  await test('drag: she walked off after the press, so moving the mouse does not yank her back', async () => {
    const page = await open();
    const s = await settle(page);
    const at = onHer(s);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await duck(page, 'place', s.x + 300, s.y + 100);
    await page.mouse.move(at.x + 12, at.y, { steps: 3 });
    await sleep(80);
    const c = await state(page);
    assert.notEqual(c.state, 'dragged');
    assert.equal(c.drag, null, 'called off');
    await page.mouse.up();
  });

  await test('drag: right button and Ctrl/Shift presses do not pick her up', async () => {
    const page = await open();
    const s = await settle(page);
    const at = onHer(s);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(at.x + 60, at.y, { steps: 5 });
    let c = await state(page);
    assert.equal(c.drag, null);
    assert.notEqual(c.state, 'dragged');
    await page.mouse.up({ button: 'right' });
    await page.keyboard.press('Escape').catch(() => {});   // closes a context menu if one opened
  });

  await test('drag: Esc mid-drag lets go without hiding her, and the later release clicks nothing', async () => {
    const page = await open();
    const box = await page.evaluate(() => { const r = document.getElementById('link').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await settle(page, box.x + 60, box.y + 60);
    const r = (await state(page)).r;
    await duck(page, 'place', box.x, box.y + r * 0.75);
    await sleep(30);
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 30, { steps: 6 });
    await until(async () => (await state(page)).state === 'dragged', 'dragged', 2000);
    await page.keyboard.press('Escape');
    const c = await until(async () => { const v = await state(page); return v.state !== 'dragged' ? v : null; }, 'her to be let go', 1500);
    assert.equal(c.drag, null);
    assert.equal(c.submerged, false);
    await page.mouse.move(box.x, box.y, { steps: 4 });
    await page.mouse.up();
    await sleep(120);
    assert.deepEqual(await page.evaluate(() => window.__log.click), []);
  });

  await test('drag: she can be grabbed out of a nap, and the nap props go away', async () => {
    const page = await open({ cfg: { model: 'techie' } });
    const s = await settle(page);
    await duck(page, 'trigger', 'sleep');
    await until(async () => (await state(page)).state === 'codenap', 'bedtime', 2000);
    await duck(page, 'setDuck', 'cnPhase', 'type');
    const cur = await state(page);
    const at = onHer(cur);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x - 70, at.y - 50, { steps: 6 });
    await until(async () => (await state(page)).state === 'dragged', 'dragged', 2000);
    await page.mouse.up();
    await until(async () => (await state(page)).state !== 'dragged', 'release', 1000);
    await sleep(100);
    assert.deepEqual(page.errors, []);
    void s;
  });

  await test('touch: long press and drag moves her, the page does not scroll', async () => {
    const page = await open({ touch: true });
    const s = await settle(page);
    const at = onHer(s);
    await page.touchscreen.touchStart(at.x, at.y);
    await sleep(120);
    let c = await state(page);
    assert.notEqual(c.state, 'dragged', 'not yet');
    assert.equal(c.drag && c.drag.touch, true, 'armed');
    await sleep(600);
    c = await state(page);
    assert.equal(c.state, 'dragged', `long press picks her up (${JSON.stringify({ x: c.x, y: c.y, px: c.px, py: c.py, r: c.r, drag: c.drag, sub: c.submerge, at })})`);
    await page.touchscreen.touchMove(at.x - 80, at.y - 60);
    await page.touchscreen.touchMove(at.x - 160, at.y - 120);
    await sleep(250);
    c = await state(page);
    assert.ok(Math.hypot(c.x - (at.x - 160), c.y - (at.y - 120 + c.r * 0.75)) < c.r * 2, 'follows the finger');
    const y = await page.evaluate(() => window.scrollY);
    assert.equal(y, 0, 'page did not scroll');
    await page.touchscreen.touchEnd();
    await until(async () => (await state(page)).state === 'dragback', 'dragback', 1500);
    assert.equal(await page.evaluate(() => window.scrollY), 0);
  }, { chromeOnly: true, why: 'touch input is only emulated in Chromium here' });

  await test('touch: a swipe starting on her scrolls the page, she stays in the water', async () => {
    const page = await open({ touch: true });
    const s = await settle(page);
    const at = onHer(s);
    await page.touchscreen.touchStart(at.x, at.y);
    await sleep(50);
    for (let i = 1; i <= 8; i++) { await page.touchscreen.touchMove(at.x, at.y - i * 30); await sleep(16); }
    const c = await state(page);
    assert.notEqual(c.state, 'dragged');
    assert.equal(c.drag, null, 'the long press was called off');
    await page.touchscreen.touchEnd();
    await until(() => page.evaluate(() => window.scrollY > 0), 'the page to scroll', 1500);
  }, { chromeOnly: true, why: 'touch input is only emulated in Chromium here' });

  console.log('Hide with Esc');

  await test('esc: dives with the family, draws nothing at all, Esc brings all back', async () => {
    const page = await open({ cfg: { ducklings: 3 } });
    const s = await settle(page);
    assert.equal(s.babies.length, 3);
    await duck(page, 'countFrames');
    await page.keyboard.press('Escape');
    const down = await until(async () => { const c = await state(page); return c.submerged ? c : null; }, 'dive', 1500);
    assert.equal(down.state, 'hide');
    const parked = await until(async () => { const c = await state(page); return c.parked ? c : null; }, 'scene to empty', 5000);
    assert.equal(parked.hostDisplay, 'none', 'overlay gone');
    assert.ok(parked.babies.every((b) => b.vanish === 1), 'the ducklings went too');
    await duck(page, 'countFrames');
    await page.mouse.move(400, 300, { steps: 5 });
    await sleep(600);
    assert.equal(await duck(page, 'frames'), 0, 'no frames while hidden, not even when the cursor moves');
    await page.keyboard.press('Escape');
    const up = await until(async () => { const c = await state(page); return !c.submerged ? c : null; }, 'surface', 1500);
    assert.equal(up.hostDisplay, 'block');
    assert.equal(up.state, 'surface');
    assert.ok(Math.hypot(up.x - 400, up.y - 300) < up.r * 4, 'comes up by the cursor');
    await until(async () => { const c = await state(page); return c.babies.every((b) => b.vanish === 0 && b.submerge < 0.3) && c.submerge < 0.2 ? c : null; }, 'everybody back', 3000);
    const c = await state(page);
    assert.equal(c.stats.hides, 1);
    assert.deepEqual(page.errors, []);
  });

  await test('esc: never prevented, the page sees every press', async () => {
    const page = await open();
    await settle(page);
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).submerged, 'dive', 1500);
    await page.keyboard.press('Escape');
    await until(async () => !(await state(page)).submerged, 'surface', 1500);
    const log = await page.evaluate(() => window.__log.keydown.filter((k) => k.key === 'Escape' || k.tail));
    assert.equal(log.filter((k) => k.key === 'Escape').length, 2);
    assert.ok(log.every((k) => !k.prevented), 'nothing was prevented');
    assert.equal(log.filter((k) => k.tail).length, 2, 'propagation went on');
  });

  for (const [id, label] of [['input', 'input'], ['area', 'textarea'], ['edit', 'contenteditable'], ['sel', 'select']]) {
    await test(`esc: stays out of it with the focus in a ${label}`, async () => {
      const page = await open();
      await settle(page);
      await page.evaluate((i) => { document.getElementById(i).focus(); }, id);
      const before = await page.evaluate((i) => document.getElementById(i).value ?? document.getElementById(i).textContent, id);
      await page.keyboard.press('Escape');
      await sleep(250);
      const c = await state(page);
      assert.equal(c.submerged, false);
      assert.equal(await page.evaluate((i) => document.getElementById(i).value ?? document.getElementById(i).textContent, id), before, 'field untouched');
      assert.equal(await page.evaluate(() => document.activeElement.id), id, 'keeps the focus');
    });
  }

  await test('esc: a native modal dialog closes and she stays; the next Esc is hers', async () => {
    const page = await open();
    await settle(page);
    await page.evaluate(() => document.getElementById('btnDialog').click());
    assert.equal(await page.evaluate(() => document.getElementById('dlg').open), true);
    await page.keyboard.press('Escape');
    await until(() => page.evaluate(() => !document.getElementById('dlg').open), 'the dialog to close', 1500);
    assert.equal((await state(page)).submerged, false, 'she stayed');
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).submerged, 'dive', 1500);
  });

  await test('esc: a custom modal that closes itself keeps the key too', async () => {
    const page = await open();
    await settle(page);
    await page.evaluate(() => document.getElementById('btnModal').click());
    await page.keyboard.press('Escape');
    await until(() => page.evaluate(() => !document.getElementById('modal')), 'the modal to close', 1500);
    await sleep(120);
    assert.equal((await state(page)).submerged, false);
  });

  await test('esc: a page handler that calls preventDefault wins', async () => {
    const page = await open();
    await settle(page);
    await page.evaluate(() => document.getElementById('btnMenu').click());
    await page.keyboard.press('Escape');
    await sleep(150);
    const log = await page.evaluate(() => window.__log.keydown.filter((k) => k.closedMenu));
    assert.equal(log.length, 1, 'the menu closed');
    assert.equal((await state(page)).submerged, false);
  });

  await test('esc: a cookie banner marked up as role=dialog does not switch her off', async () => {
    const page = await open();
    await settle(page);
    await page.evaluate(() => {
      const b = document.createElement('div');
      b.setAttribute('role', 'dialog');
      b.style.cssText = 'position:fixed;left:0;bottom:0;width:300px;padding:8px;background:#fff';
      b.innerHTML = '<button id="ok">fine</button>';
      document.body.appendChild(b);
    });
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).submerged, 'dive', 1500);
  });

  await test('esc: a role=dialog that holds the focus keeps the key', async () => {
    const page = await open();
    await settle(page);
    await page.evaluate(() => {
      const b = document.createElement('div');
      b.setAttribute('role', 'dialog');
      b.style.cssText = 'position:fixed;left:300px;top:100px;padding:20px;background:#fff';
      b.innerHTML = '<button id="ok">fine</button>';
      document.body.appendChild(b);
      document.getElementById('ok').focus();
    });
    await page.keyboard.press('Escape');
    await sleep(200);
    assert.equal((await state(page)).submerged, false);
  });

  await test('esc: invisible modals do not count', async () => {
    const page = await open();
    await settle(page);
    await page.evaluate(() => {
      for (const css of ['visibility:hidden', 'opacity:0']) {
        const b = document.createElement('div');
        b.setAttribute('role', 'dialog');
        b.setAttribute('aria-modal', 'true');
        b.style.cssText = 'position:fixed;left:0;top:0;width:100px;height:100px;' + css;
        document.body.appendChild(b);
      }
    });
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).submerged, 'dive', 1500);
  });

  await test('esc: a message the page posts to itself is not a key press', async () => {
    const page = await open();
    await settle(page);
    await page.evaluate(() => window.postMessage({ __cursorDuck: 1, esc: true }, '*'));
    await sleep(200);
    assert.equal((await state(page)).submerged, false);
  });

  await test('esc: a dialog kept hidden in the DOM does not block her', async () => {
    const page = await open();
    await settle(page);
    assert.equal(await page.evaluate(() => document.getElementById('hiddenDialog').getClientRects().length), 0);
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).submerged, 'dive', 1500);
  });

  await test('esc: fullscreen keeps its key', async () => {
    const page = await open();
    await settle(page);
    const r = await page.evaluate(() => { const b = document.getElementById('btnFull').getBoundingClientRect(); return { x: b.left + 8, y: b.top + 8 }; });
    await page.mouse.click(r.x, r.y);
    await until(() => page.evaluate(() => !!document.fullscreenElement), 'fullscreen', 2500);
    await page.keyboard.press('Escape');
    await sleep(300);
    assert.equal((await state(page)).submerged, false);
    await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
    await until(() => page.evaluate(() => !document.fullscreenElement), 'leaving fullscreen', 2500);
    assert.equal((await state(page)).submerged, false);
  });

  await test('esc: with modifiers or from far away she stays', async () => {
    const page = await open({ cfg: { follow: false } });
    await page.mouse.move(100, 100);
    await duck(page, 'place', 900, 600);
    await sleep(60);
    await page.keyboard.press('Escape');
    await sleep(150);
    assert.equal((await state(page)).submerged, false, 'too far from the cursor');
    await duck(page, 'place', 130, 130);
    await sleep(40);
    await page.keyboard.down('Shift');
    await page.keyboard.press('Escape');
    await page.keyboard.up('Shift');
    await sleep(120);
    assert.equal((await state(page)).submerged, false, 'Shift+Esc is not hers');
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).submerged, 'plain Esc nearby', 1500);
  });

  await test('esc: from inside a frame (and not from a field in that frame)', async () => {
    const page = await open();
    await settle(page);
    const frame = await until(async () => page.frames().find((f) => f.url().includes('frame.html')), 'frame');
    await frame.evaluate(() => document.getElementById('fi').focus());
    await page.keyboard.press('Escape');
    await sleep(200);
    assert.equal((await state(page)).submerged, false, 'field in a frame');
    // a widget in the frame closes its modal on the same key: that press isn't hers
    await frame.evaluate(() => {
      const m = document.createElement('div');
      m.id = 'fmodal';
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');
      m.textContent = 'modal in a frame';
      document.body.appendChild(m);
      document.getElementById('p').focus();
    });
    await page.keyboard.press('Escape');
    await sleep(200);
    assert.equal(await frame.evaluate(() => !!document.getElementById('fmodal')), false, 'the frame closed its modal');
    assert.equal((await state(page)).submerged, false, 'modal in a frame');
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).submerged, 'relay from the frame', 1500);
  });

  await test('esc: the popup switch turns it off, and frees a duck that is under', async () => {
    const page = await open();
    await settle(page);
    await duck(page, 'storageSet', 'sync', { escHide: false });
    await until(async () => (await state(page)).cfg.escHide === false, 'setting', 1500);
    await page.keyboard.press('Escape');
    await sleep(200);
    assert.equal((await state(page)).submerged, false, 'switched off');
    await duck(page, 'storageSet', 'sync', { escHide: true });
    await until(async () => (await state(page)).cfg.escHide === true, 'setting', 1500);
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).parked, 'parked', 5000);
    await duck(page, 'storageSet', 'sync', { escHide: false });
    const c = await until(async () => { const v = await state(page); return !v.submerged ? v : null; }, 'her to come back', 1500);
    assert.equal(c.hostDisplay, 'block');
  });

  await test('esc: off and on again while hidden, she is back; settings stay live', async () => {
    const page = await open();
    await settle(page);
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).parked, 'parked', 5000);
    await duck(page, 'storageSet', 'sync', { size: 1.4 });   // any setting: must not revive her
    await until(async () => (await state(page)).cfg.size === 1.4, 'setting', 1500);
    let c = await state(page);
    assert.equal(c.submerged, true, 'a setting change alone leaves her under');
    assert.equal(c.hostDisplay, 'none');
    await duck(page, 'storageSet', 'sync', { enabled: false });
    await until(async () => (await state(page)).cfg.enabled === false, 'off', 1500);
    await duck(page, 'storageSet', 'sync', { enabled: true });
    c = await until(async () => { const v = await state(page); return v.cfg.enabled && v.running ? v : null; }, 'on', 1500);
    assert.equal(c.submerged, false);
    assert.equal(c.hostDisplay, 'block');
    await sleep(200);
    assert.deepEqual(page.errors, []);
  });

  await test('esc: a popup trick while hidden brings her up to do it', async () => {
    const page = await open();
    await settle(page);
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).parked, 'parked', 5000);
    await duck(page, 'trigger', 'quack', 1.2);
    const c = await state(page);
    assert.equal(c.submerged, false);
    assert.equal(c.state, 'quack');
    assert.equal(c.hostDisplay, 'block');
  });

  await test('esc: a focused password field stops her, and the hidden state survives it', async () => {
    const page = await open();
    await settle(page);
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).parked, 'parked', 5000);
    await page.evaluate(() => {
      const i = document.createElement('input'); i.type = 'password'; i.id = 'pw';
      document.body.appendChild(i); i.focus();
    });
    await until(async () => (await state(page)).halted, 'focus mode', 1500);
    await page.evaluate(() => document.getElementById('pw').blur());
    const c = await until(async () => { const v = await state(page); return !v.halted ? v : null; }, 'focus mode to end', 1500);
    assert.equal(c.submerged, true, 'still under');
    assert.equal(c.hostDisplay, 'none', 'and still not drawn');
  });

  console.log('Daily gift');

  async function freshGifts(page) { await duck(page, 'storageSet', 'local', { gifts: { last: '', total: 0, counts: {} } }); }
  async function gifts(page) { return (await duck(page, 'storageGet', 'local', { gifts: null })).gifts; }

  await test('gift: first visit of the day brings one; she shows it, it lands in storage', async () => {
    let page = await open();
    await freshGifts(page);
    await close(page);
    page = await open({ hash: '#clock=2026-11-05T10:00:00', claims: true });
    await page.mouse.move(600, 400);
    const run = await until(async () => { const c = await state(page); return c.giftRun ? c : null; }, 'the gift run', 9000);
    assert.equal(run.state, 'gift');
    const g = await gifts(page);
    assert.equal(g.last, '2026-11-5');
    assert.equal(g.total, 1);
    assert.equal(g.counts[run.giftRun], 1);
    const shown = await until(async () => { const c = await state(page); return c.giftObj ? c : null; }, 'the gift on the water', 6000);
    assert.equal(shown.giftObj.id, run.giftRun);
    assert.ok(shown.giftObj.x >= 0 && shown.giftObj.x <= shown.w && shown.giftObj.y >= 0 && shown.giftObj.y <= shown.h, 'in view');
    await until(async () => (await state(page)).giftObj === null, 'it to fade', 7000);
    const end = await state(page);
    assert.notEqual(end.state, 'gift');
    assert.equal(end.carry, null);
    assert.deepEqual(page.errors, []);
  });

  await test('gift: same day again brings nothing, next day brings the next', async () => {
    let page = await open({ hash: '#clock=2026-11-05T10:00:00' });
    await duck(page, 'storageSet', 'local', { gifts: { last: '2026-11-5', total: 1, counts: { pebble: 1 } } });
    await close(page);
    page = await open({ hash: '#clock=2026-11-05T23:50:00', claims: true });
    await page.mouse.move(600, 400);
    await sleep(5500);
    let c = await state(page);
    assert.equal(c.giftRun, null);
    assert.equal(c.giftObj, null);
    assert.equal((await gifts(page)).total, 1, 'same day');
    await close(page);
    page = await open({ hash: '#clock=2026-11-06T00:01:00', claims: true });
    await page.mouse.move(600, 400);
    await until(async () => (await gifts(page)).total === 2, 'next day', 8000);
    assert.equal((await gifts(page)).last, '2026-11-6');
  });

  await test('gift: a tab left open past midnight waits for its owner', async () => {
    const page = await open({ hash: '#clock=2026-11-07T23:59:30', claims: true });
    await duck(page, 'storageSet', 'local', { gifts: { last: '2026-11-7', total: 5, counts: { pebble: 5 } } });
    await sleep(1200);
    await duck(page, 'setClock', '2026-11-08T00:00:10');
    await duck(page, 'setEngine', 'pointerIdle', 300);   // nobody at the mouse
    await sleep(2500);
    assert.equal((await gifts(page)).total, 5, 'no gift for an empty room');
    await page.mouse.move(500, 300, { steps: 4 });
    await until(async () => (await gifts(page)).total === 6, 'the gift when somebody is back', 6000);
    assert.equal((await gifts(page)).last, '2026-11-8');
  });

  await test('gift: several tabs at once, still only one', async () => {
    const first = await open();
    await duck(first, 'storageSet', 'local', { gifts: { last: '2026-11-8', total: 3, counts: { shell: 3 } } });
    await close(first);
    const pages = await Promise.all([1, 2, 3].map(() => open({ hash: '#clock=2026-11-09T09:00:00', claims: true })));
    // straight at the background page, all in the same moment
    const replies = await Promise.all(pages.map((p) => duck(p, 'claim', '2026-11-9')));
    const given = replies.filter((r) => r && r.gift);
    assert.equal(given.length, 1, JSON.stringify(replies));
    await sleep(4500);
    const g = await gifts(pages[2]);   // the tab in front; the others are hidden and throttled
    assert.equal(g.total, 4, 'one more, not three');
    assert.equal(g.last, '2026-11-9');
  });

  await test('gift: not on a paused site, not while switched off, not while hidden', async () => {
    let page = await open();
    await duck(page, 'storageSet', 'local', { gifts: { last: '2026-11-10', total: 2, counts: { pebble: 2 } } });
    await duck(page, 'storageSet', 'sync', { disabledHosts: ['127.0.0.1'] });
    await close(page);
    page = await open({ hash: '#clock=2026-11-11T09:00:00', claims: true, cfg: { disabledHosts: ['127.0.0.1'] } });
    await sleep(4500);
    assert.equal((await gifts(page)).total, 2, 'paused site');
    await duck(page, 'storageSet', 'sync', { disabledHosts: [], enabled: false });
    await sleep(4500);
    assert.equal((await gifts(page)).total, 2, 'switched off');
    await duck(page, 'storageSet', 'sync', { enabled: true });
    await page.mouse.move(600, 400);
    await sleep(120);
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).submerged, 'dive', 2000);
    await sleep(4500);
    assert.equal((await gifts(page)).total, 2, 'hidden');
    await page.keyboard.press('Escape');
    await until(async () => (await gifts(page)).total === 3, 'the gift once she is back', 8000);
  });

  await test('gift: grabbing her on the way does not lose it', async () => {
    const page = await open();
    const s = await settle(page);
    await duck(page, 'trigger', 'gift');
    // above water with it; under water there's nothing to grab
    const c = await until(async () => { const v = await state(page); return v.carry && v.submerge < 0.3 ? v : null; }, 'something in her beak', 3000);
    const at = onHer(c);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x - 60, at.y - 50, { steps: 6 });
    await until(async () => (await state(page)).state === 'dragged', 'dragged', 2000);
    const held = await state(page);
    assert.equal(held.carry, null, 'dropped');
    assert.ok(held.giftObj, 'and floating');
    await page.mouse.up();
    void s;
  });

  await test('gift: sent under with Esc on the way, she brings it when she is back', async () => {
    const page = await open();
    await settle(page);
    await duck(page, 'trigger', 'gift');
    const run = await until(async () => { const c = await state(page); return c.giftRun ? c : null; }, 'the run', 1500);
    await page.keyboard.press('Escape');
    let c = await until(async () => { const v = await state(page); return v.submerged ? v : null; }, 'dive', 1500);
    assert.equal(c.giftObj, null, 'nothing pops out on the way down');
    assert.equal(c.giftQ, run.giftRun, 'it waits');
    await page.keyboard.press('Escape');
    c = await until(async () => { const v = await state(page); return v.giftObj ? v : null; }, 'the gift after she is back', 6000);
    assert.equal(c.giftObj.id, run.giftRun);
  });

  await test('gift: the trick button only shows one, nothing lands in the collection', async () => {
    const page = await open();
    await noGiftToday(page);
    const before = await gifts(page);
    await settle(page);
    await duck(page, 'trigger', 'gift');
    await until(async () => (await state(page)).giftObj, 'the preview', 5000);
    assert.equal((await gifts(page)).total, before.total);
  });

  console.log('Popup');

  async function popupPage(setup) {
    const page = await open();
    await duck(page, 'storageSet', 'local', setup.local);
    if (setup.sync) await duck(page, 'storageSet', 'sync', setup.sync);
    const p = await openExtPage(page, 'popup/popup.html');
    await until(() => p.evaluate(() => document.querySelectorAll('#gifts .g').length > 0), 'the shelf');
    return p;
  }

  await test('popup: shelf shows what she brought, the rest stays a mystery', async () => {
    const p = await popupPage({ local: { gifts: { last: 'x', total: 5, lastKind: 'coin', counts: { pebble: 3, shell: 1, coin: 1 } }, stats: { pets: 0, pecks: 0 } } });
    const info = await p.evaluate(() => ({
      tiles: document.querySelectorAll('#gifts .g').length,
      locked: document.querySelectorAll('#gifts .g.locked').length,
      count: document.getElementById('giftCount').textContent,
      mystery: [...document.querySelectorAll('#gifts .g.locked span')].every((s) => s.textContent === '???'),
      times: [...document.querySelectorAll('#gifts .g .n')].map((n) => n.textContent),
      ach: document.getElementById('achCount').textContent
    }));
    assert.equal(info.tiles, 14);
    assert.equal(info.locked, 11);
    assert.equal(info.count, '3/14');
    assert.ok(info.mystery);
    assert.deepEqual(info.times, ['×3']);
    assert.ok(info.ach.endsWith('/76'), info.ach);
    assert.deepEqual(p.errors, []);
  });

  await test('popup: gift achievements count from the collection, 7 kinds unlock the wreath', async () => {
    const counts = { pebble: 1, shell: 1, snail: 1, feather: 1, acorn: 1, marble: 1 };
    let p = await popupPage({ local: { gifts: { last: 'x', total: 6, counts }, stats: { pets: 0, pecks: 0 } } });
    const wreathLocked = () => p.evaluate(() => {
      const tiles = [...document.querySelectorAll('#wearHats .w')];
      return tiles[tiles.length - 1].classList.contains('locked');
    });
    await until(() => p.evaluate(() => document.querySelectorAll('#wearHats .w').length > 0), 'wardrobe');
    assert.equal(await wreathLocked(), true, 'six kinds: still locked');
    await close(p);
    p = await popupPage({ local: { gifts: { last: 'x', total: 7, counts: { ...counts, cork: 1 } }, stats: { pets: 0, pecks: 0, drags: 5, hides: 10, leaves: 5 } } });
    await until(() => p.evaluate(() => document.querySelectorAll('#wearHats .w').length > 0), 'wardrobe');
    assert.equal(await wreathLocked(), false, 'seven kinds: unlocked');
    const done = await p.evaluate(() => document.querySelectorAll('#achievements .a.done').length);
    // first gift, 7 kinds, drag bronze, hide, leaf
    assert.equal(done, 5);
  });

  await test('popup: the Esc switch is there, on by default, and saves', async () => {
    const p = await popupPage({ local: { gifts: null } });
    assert.equal(await p.evaluate(() => document.getElementById('escHide').checked), true);
    await p.evaluate(() => document.getElementById('escHide').click());
    const v = await p.evaluate(() => new Promise((res) => chrome.storage.sync.get({ escHide: null }, (o) => res(o.escHide))));
    assert.equal(v, false);
    const lab = await p.evaluate(() => document.querySelector('[data-i18n="chkEscHide"]').textContent);
    assert.ok(/Esc/.test(lab));
    await p.evaluate(() => document.getElementById('escHide').click());
  });

  await test('popup: the day counter shows streak, record and total, and lights up once today is counted', async () => {
    const today = await (async () => { const pg = await open(); const d = await duck(pg, 'today'); await close(pg); return d; })();
    const parts = today.split('-').map(Number);
    const key = (off) => { const d = new Date(parts[0], parts[1] - 1, parts[2] + off); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
    const read = (p) => p.evaluate(() => ({
      n: document.getElementById('dayStreak').textContent, label: document.getElementById('dayLabel').textContent,
      sub: document.getElementById('daySub').textContent, hint: document.getElementById('dayHint').textContent,
      cold: document.getElementById('days').classList.contains('cold'), visible: document.getElementById('days').getBoundingClientRect().height > 20,
      top: document.getElementById('days').getBoundingClientRect().top, debug: document.getElementById('dayDebug').hidden
    }));
    // counted today
    let p = await popupPage({ local: { days: { last: today, streak: 12, best: 30, total: 87 }, gifts: null, stats: { pets: 0, pecks: 0 } } });
    let v = await read(p);
    assert.deepEqual([v.n, v.cold, v.hint], ['12', false, '']);
    assert.ok(/30/.test(v.sub) && /87/.test(v.sub), v.sub);
    assert.ok(v.visible && v.top < 330, 'in view without opening anything: ' + v.top);
    assert.equal(v.debug, true, 'the test switch stays out of sight');
    await close(p);
    // yesterday: the run is alive, today not counted yet
    p = await popupPage({ local: { days: { last: key(-1), streak: 12, best: 30, total: 87 }, gifts: null } });
    v = await read(p);
    assert.deepEqual([v.n, v.cold], ['12', true]);
    assert.ok(v.hint.length > 10, 'says how today gets counted');
    await close(p);
    // the day before yesterday: over
    p = await popupPage({ local: { days: { last: key(-2), streak: 12, best: 30, total: 87 }, gifts: null } });
    v = await read(p);
    assert.deepEqual([v.n, v.cold], ['0', true]);
    assert.ok(/30/.test(v.sub), 'the record stays');
    await close(p);
    // one day reads as one day
    p = await popupPage({ local: { days: { last: today, streak: 1, best: 1, total: 1 }, gifts: null } });
    v = await read(p);
    assert.equal(v.n, '1');
    assert.ok(!/days|Tage/.test(v.label), 'singular: ' + v.label);
    await close(p);
    // not updated yet: the 1.9.0 streak is shown from the play counters
    const pg = await open();
    await duck(pg, 'storageClear', 'local');
    await duck(pg, 'storageSet', 'local', { stats: { pets: 0, pecks: 0, streakDays: 9, streakLast: today } });
    p = await openExtPage(pg, 'popup/popup.html');
    await until(() => p.evaluate(() => document.getElementById('dayStreak').textContent === '9'), 'the old streak', 3000);
    assert.deepEqual(p.errors, []);
  });

  await test('popup: day badges count from the record, so a missed day takes none away', async () => {
    const p = await popupPage({ local: {
      days: { last: '2026-1-1', streak: 1, best: 31, total: 100 }, brood: { ages: [0], fledged: 1 }, gifts: null,
      stats: { pets: 0, pecks: 0, flocks: 3, streakDays: 2 }
    } });
    const done = await p.evaluate(() => [...document.querySelectorAll('#achievements .a.done .tx')].map((t) => t.textContent));
    assert.equal(done.length, 5, done.join(', '));   // week, month, hundred days, fledged, birds
    assert.equal(await p.evaluate(() => document.getElementById('achCount').textContent), '5/76');
  });

  await test('popup: the family shows every duckling at her stage, and how long until the next', async () => {
    let p = await popupPage({ local: { brood: { ages: [0, 6, 11, 17, 3, 3, 3, 3], fledged: 2 }, gifts: null }, sync: { ducklings: 4 } });
    await until(() => p.evaluate(() => document.querySelectorAll('#brood .k').length === 4), 'four tiles');
    let v = await p.evaluate(() => ({
      names: [...document.querySelectorAll('#brood .k .st')].map((n) => n.textContent),
      next: [...document.querySelectorAll('#brood .k span:not(.st)')].map((n) => n.textContent),
      note: document.getElementById('broodNote').textContent, count: document.getElementById('broodCount').textContent,
      drawn: [...document.querySelectorAll('#brood canvas')].map((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; })
    }));
    assert.equal(new Set(v.names).size, 4, 'four different stages: ' + v.names);
    assert.deepEqual(v.next.map((t) => +t.replace(/\D/g, '')), [3, 1, 1, 1], v.next.join(' | '));
    assert.ok(/2\s*$/.test(v.note), 'two have grown up: ' + v.note);
    assert.equal(v.count, '4');
    for (let i = 1; i < 4; i++) assert.ok(v.drawn[i] > v.drawn[i - 1], 'each drawn bigger than the one before: ' + v.drawn);
    // the slider changes the family at once
    await p.evaluate(() => { const el = document.getElementById('ducklings'); el.value = 2; el.dispatchEvent(new Event('input')); });
    assert.equal(await p.evaluate(() => document.querySelectorAll('#brood .k').length), 2);
    await p.evaluate(() => { const el = document.getElementById('ducklings'); el.value = 0; el.dispatchEvent(new Event('input')); });
    v = await p.evaluate(() => ({ tiles: document.querySelectorAll('#brood .k').length, note: document.getElementById('broodNote').textContent }));
    assert.equal(v.tiles, 0);
    assert.ok(v.note.length > 20, 'says where the ducklings are');
    assert.deepEqual(p.errors, []);
  });

  await test('popup: five clicks on the counter show the test switch, +1 day counts and grows without moving the date', async () => {
    const pg = await open();
    const today = await duck(pg, 'today');
    await duck(pg, 'storageSet', 'sync', { ducklings: 2 });
    await duck(pg, 'storageSet', 'local', {
      days: { last: today, at: 1234, streak: 3, best: 3, total: 3 }, brood: { ages: [2, 16, 0, 0, 0, 0, 0, 0], fledged: 0 },
      gifts: { last: today, total: 3, counts: { pebble: 3 } }
    });
    const p = await openExtPage(pg, 'popup/popup.html');
    await until(() => p.evaluate(() => document.getElementById('dayStreak').textContent === '3'), 'the counter');
    assert.equal(await p.evaluate(() => document.getElementById('dayDebug').hidden), true);
    for (let i = 0; i < 4; i++) await p.evaluate(() => document.getElementById('dayMain').click());
    assert.equal(await p.evaluate(() => document.getElementById('dayDebug').hidden), true, 'four are not enough');
    await p.evaluate(() => document.getElementById('dayMain').click());
    assert.equal(await p.evaluate(() => document.getElementById('dayDebug').hidden), false);
    await p.evaluate(() => document.getElementById('dbgDay').click());
    await until(() => p.evaluate(() => document.getElementById('dayStreak').textContent === '4'), 'one more day', 3000);
    let all = await p.evaluate(() => new Promise((res) => chrome.storage.local.get(null, res)));
    assert.deepEqual([all.days.last, all.days.at, all.days.streak, all.days.best, all.days.total], [today, 1234, 4, 4, 4]);
    assert.deepEqual(all.brood.ages.slice(0, 2), [3, 17]);
    assert.equal(all.gifts.total, 3, 'no gift from the test switch');
    assert.ok(await p.evaluate(() => /ages 3,17/.test(document.getElementById('dbgInfo').textContent)), 'the raw state is there to read');
    await p.evaluate(() => document.getElementById('dbgDay').click());
    await until(() => p.evaluate(() => document.getElementById('dayStreak').textContent === '5'), 'and another', 3000);
    all = await p.evaluate(() => new Promise((res) => chrome.storage.local.get(null, res)));
    assert.deepEqual([all.brood.ages[1], all.brood.fledged], [0, 1], 'the elder one grew up');
    await until(() => p.evaluate(() => /1\s*$/.test(document.getElementById('broodNote').textContent)), 'the family note follows', 2000);
    // it stays open for the next popup, until five more clicks put it away
    // reloaded from inside: Firefox's remote protocol doesn't navigate extension pages itself
    await p.evaluate(() => { window.__old = true; location.reload(); }).catch(() => {});
    await until(() => p.evaluate(() => !window.__old && !!document.getElementById('dayDebug') &&
      document.getElementById('dayStreak').textContent === '5').catch(() => false), 'the popup again', 6000);
    assert.equal(await p.evaluate(() => document.getElementById('dayDebug').hidden), false);
    for (let i = 0; i < 5; i++) await p.evaluate(() => document.getElementById('dayMain').click());
    assert.equal(await p.evaluate(() => document.getElementById('dayDebug').hidden), true);
    assert.deepEqual(p.errors, []);
  });

  await test('popup: asked through the page, the test day gives the ducklings there their ceremony', async () => {
    // Firefox turns a tab of its own into the popup; opened first, before it can reset what this test stores
    const spare = FIREFOX ? await open({ cfg: { ducklings: 2 } }) : null;
    const pg = await open({ cfg: { ducklings: 2 } });
    const today = await duck(pg, 'today');
    await duck(pg, 'storageSet', 'local', {
      days: { last: today, streak: 3, best: 3, total: 3 }, brood: { ages: [2, 5, 0, 0, 0, 0, 0, 0], fledged: 0 },
      gifts: { last: today, total: 3, counts: { pebble: 3 } }
    });
    await until(async () => (await state(pg)).brood.ages[0] === 2, 'the family', 2000);
    // The popup sends this to the tab it was opened on. A popup opened as a tab has no such
    // tab, so the message goes out by hand; only `pg` has a duck to hear it.
    const p = await openExtPage(spare || pg, 'popup/popup.html');
    const replies = await p.evaluate(() => new Promise((res) => {
      chrome.tabs.query({}, (tabs) => {
        let left = tabs.length;
        const got = [];
        tabs.forEach((t) => chrome.tabs.sendMessage(t.id, { type: 'duck:nextday' }, (r) => {
          void chrome.runtime.lastError;
          if (r) got.push(r);
          if (--left === 0) res(got);
        }));
      });
    }));
    assert.deepEqual(replies, [{ ok: true }]);
    await pg.bringToFront();
    const s = await until(async () => { const v = await state(pg); return v.babies[0].stage === 1 && v.brood.queue.length === 0 ? v : null; }, 'her growth spurt', 9000, 60);
    assert.deepEqual(s.brood.ages.slice(0, 2), [3, 6]);
    const d = await daysOf(pg);
    assert.deepEqual([d.streak, d.last], [4, today]);
    assert.deepEqual(pg.errors, []);
  });

  await test('update page: new features listed, buttons work, no errors', async () => {
    const page = await open();
    const p = await openExtPage(page, 'welcome/update.html');
    await until(() => p.evaluate(() => document.readyState === 'complete'), 'the page');
    const stored = () => p.evaluate(() => new Promise((res) => chrome.storage.local.get({ brood: null, days: null }, (o) => res(JSON.stringify(o)))));
    const storedBefore = await stored();
    const items = await p.evaluate(() => [...document.querySelectorAll('.card li')].map((li) => li.textContent));
    assert.equal(items.length, 4);
    assert.ok(items.every((t) => t.length > 40), 'every item has its text');
    await until(() => p.evaluate(() => !!window.__duck), 'the page duck');
    const fam = () => p.evaluate(() => window.__duck.babies.map((b) => b.stage));
    const before = await fam();
    assert.ok(before.length >= 3, 'a family to grow');
    assert.ok(new Set(before).size > 1, 'at different stages: ' + before);
    await p.evaluate(() => document.getElementById('birdsBtn').click());
    assert.equal(await p.evaluate(() => !!window.__duck.flock), true);
    await until(() => p.evaluate(() => document.querySelectorAll('[data-cursor-duck-sky]').length === 1), 'the birds\' layer', 2000);
    // one more day: the two behind the eldest reach their next stage
    await p.evaluate(() => document.getElementById('dayBtn').click());
    await until(async () => { const now = await fam(); return now[1] === before[1] + 1 && now[2] === before[2] + 1; }, 'two growth spurts', 12000);
    // and another: the eldest is grown up, leaves, and an egg takes her place
    await p.evaluate(() => document.getElementById('dayBtn').click());
    await until(() => p.evaluate(() => !!window.__duck.fledge), 'her farewell', 12000);
    await until(() => p.evaluate(() => !!window.__duck.babies[0].egg), 'the egg', 3000);
    await until(() => p.evaluate(() => !window.__duck.babies[0].egg && window.__duck.babies[0].stage === 0 && !window.__duck.fledge), 'the hatchling', 9000);
    // nothing of this page's play is stored or counted
    assert.equal(await stored(), storedBefore);
    assert.deepEqual(p.errors, []);
  });

  console.log('Drifting leaves');

  await test('leaves: on their own only from September through November', async () => {
    for (const [iso, expected] of [
      ['2026-08-31T12:00:00', false], ['2026-09-01T12:00:00', true], ['2026-10-15T12:00:00', true],
      ['2026-11-30T12:00:00', true], ['2026-12-01T12:00:00', false], ['2027-03-15T12:00:00', false]
    ]) {
      const page = await open({ hash: '#clock=' + iso, cfg: { playfulness: 1 } });
      await noGiftToday(page);
      await settle(page);
      await duck(page, 'setEngine', 'fishCd', 999);
      await duck(page, 'setEngine', 'visitorCd', 999);
      await duck(page, 'leafNow');
      await sleep(200);
      const c = await state(page);
      assert.equal(!!c.leaf, expected, iso);
      await close(page);
    }
  });

  await test('leaves: not on their own under reduced motion, with effects off or at low playfulness', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00', cfg: { playfulness: 1 } });
    await noGiftToday(page);
    await settle(page);
    await duck(page, 'setEngine', 'fishCd', 999);
    await duck(page, 'setEngine', 'visitorCd', 999);
    await duck(page, 'apply', { reduceMotion: true });
    await duck(page, 'leafNow');
    await sleep(200);
    assert.equal((await state(page)).leaf, null, 'reduced motion');
    await duck(page, 'apply', { reduceMotion: false, effects: false });
    await duck(page, 'leafNow');
    await sleep(200);
    assert.equal((await state(page)).leaf, null, 'effects off');
    await duck(page, 'apply', { effects: true, playfulness: 0.2 });
    await duck(page, 'leafNow');
    await sleep(200);
    assert.equal((await state(page)).leaf, null, 'low playfulness');
    await duck(page, 'apply', { playfulness: 1 });
    await duck(page, 'leafNow');
    await sleep(200);
    assert.ok((await state(page)).leaf, 'and on again');
  });

  await test('leaves: reduced motion follows the real media query, a requested leaf stays calm', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00' });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await until(async () => (await state(page)).cfg.reduceMotion === true, 'the OS setting to arrive', 2000);
    await settle(page);
    await duck(page, 'trigger', 'leaf');
    const c = await state(page);
    assert.ok(c.leaf, 'the button still works');
    assert.equal(c.leaf.spin, 0);
    assert.equal(c.leaf.z, 0, 'no fall');
  }, { chromeOnly: true, why: 'media feature emulation needs CDP; the engine side is covered above' });

  await test('leaves: she taps one that drifts close, and it counts', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00' });
    await noGiftToday(page);
    await settle(page);
    await page.mouse.move(700, 450);
    await duck(page, 'spawnLeafAt', 60, 6);
    await duck(page, 'setEngine', 'pointerIdle', 0);
    const nudged = await until(async () => { const c = await state(page); return c.state === 'leafnudge' || c.state === 'sleep' ? c : null; }, 'a reaction', 3000);
    if (nudged.state === 'sleep') return;   // the other branch of the coin toss has its own test
    const c = await until(async () => { const v = await state(page); return v.state !== 'leafnudge' ? v : null; }, 'the tap', 3000);
    assert.equal(c.stats.leaves, 1);
    assert.ok(Math.abs(c.leaf.vx) > 5, 'the leaf got a push');
  });

  await test('leaves: no early bedtime against the nap setting, nor past a bedtime ritual', async () => {
    let page = await open({ hash: '#clock=2026-10-15T12:00:00', cfg: { sleepAfter: 60 } });
    await noGiftToday(page);
    await settle(page);
    for (let i = 0; i < 4; i++) {
      await duck(page, 'setEngine', 'pointerIdle', 5);
      await duck(page, 'spawnLeafAt', 40, 4);
      const c = await until(async () => { const v = await state(page); return v.state !== 'idle' && v.state !== 'look' && v.state !== 'bob' ? v : null; }, 'a reaction', 2500);
      assert.equal(c.state, 'leafnudge', 'round ' + i);
      await until(async () => (await state(page)).state !== 'leafnudge', 'the tap', 2500);
      await duck(page, 'setEngine', 'leaf', null);
    }
    await close(page);
    page = await open({ hash: '#clock=2026-10-15T12:00:00', cfg: { sleepAfter: 5, ducklings: 2 } });
    await noGiftToday(page);
    await settle(page);
    await duck(page, 'setEngine', 'pointerIdle', 4);
    await duck(page, 'spawnLeafAt', 40, 4);
    const c = await until(async () => { const v = await state(page); return v.state !== 'idle' && v.state !== 'look' && v.state !== 'bob' ? v : null; }, 'a reaction', 2500);
    assert.equal(c.state, 'leafnudge', 'ducklings first');
  });

  await test('stats: a delayed save carries what another tab reported meanwhile', async () => {
    const page = await open();
    await settle(page);
    await duck(page, 'setEngine', 'pointerIdle', 1);
    // two counts in quick succession: the second one goes out with the delayed write
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).submerged, 'dive', 1500);
    await page.keyboard.press('Escape');
    await until(async () => !(await state(page)).submerged, 'back', 1500);
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).submerged, 'dive again', 1500);
    // meanwhile another tab wrote: pets went up
    await duck(page, 'storageSet', 'local', { stats: { pets: 42, pecks: 0, hides: 2 } });
    await sleep(2300);
    const stored = (await duck(page, 'storageGet', 'local', { stats: null })).stats;
    assert.equal(stored.pets, 42, 'the other tab\'s count survived');
  });

  await test('leaves: she dozes off and it comes to rest on her; waking shakes it off', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00' });
    await noGiftToday(page);
    const s = await settle(page);
    await duck(page, 'trigger', 'sleep');
    await until(async () => (await state(page)).state === 'sleep', 'nap', 3000);
    await sleep(1800);   // she coasts to a stop first, and that glide rightly counts as motion
    await duck(page, 'spawnLeafAt', s.r * 2.4, 0);
    const on = await until(async () => { const c = await state(page); return c.leaf && c.leaf.on ? c : null; }, 'the leaf to settle', 8000);
    assert.equal(on.stats.leaves, 1);
    await duck(page, 'countFrames');
    await sleep(1000);
    const fps = await duck(page, 'frames');
    assert.ok(fps <= 40, `a leaf on a sleeping duck keeps the calm rate: ${fps} fps, busy ${JSON.stringify(await duck(page, 'busyFrames'))}`);
    await page.mouse.move(650, 400, { steps: 6 });
    const off = await until(async () => { const c = await state(page); return c.state !== 'sleep' ? c : null; }, 'her to wake', 2000);
    await until(async () => { const c = await state(page); return !c.leaf || !c.leaf.on; }, 'the leaf to fall', 2000);
    void off;
    assert.deepEqual(page.errors, []);
  });

  await test('leaves: one left behind fades instead of stretching the stage', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00' });
    await noGiftToday(page);
    await settle(page, 200, 500);
    await duck(page, 'spawnLeafAt', 40, 0);
    await duck(page, 'setEngine', 'leafCd', 999);
    await page.mouse.move(1000, 150, { steps: 6 });
    await until(async () => (await state(page)).leaf === null, 'the leaf to go', 6000);
  });

  console.log('Days together');

  await test('days: the first visit of a day counts it, on the page she is on', async () => {
    let page = await open();
    await duck(page, 'storageClear', 'local');
    await close(page);
    page = await open({ hash: '#clock=2026-11-13T10:00:00', claims: true });
    await duck(page, 'storageClear', 'local');              // open() wrote its own counters; start from nothing
    await page.mouse.move(600, 400);
    const d = await until(() => daysOf(page), 'the day to be counted', 9000);
    assert.deepEqual([d.last, d.streak, d.best, d.total], ['2026-11-13', 1, 1, 1]);
    assert.ok(Math.abs(d.at - new Date('2026-11-13T10:00:00').getTime()) < 60000, 'with the moment of the visit: ' + d.at);
    const g = (await local(page, { gifts: null })).gifts;
    assert.equal(g.last, '2026-11-13', 'the gift comes with the same visit');
    assert.ok(await broodOf(page), 'and the family has its record');
    // the rest of the day: nothing more, however long she is watched
    await sleep(4500);
    assert.deepEqual((await daysOf(page)).total, 1);
    assert.deepEqual(page.errors, []);
  });

  await test('days: day after day through the background page, and a missed day', async () => {
    const page = await open();
    await duck(page, 'storageClear', 'local');
    const steps = [
      ['2026-11-13', 1, 1, 1], ['2026-11-13', 1, 1, 1], ['2026-11-14', 2, 2, 2], ['2026-11-15', 3, 3, 3],
      ['2026-11-17', 1, 3, 4],                               // the 16th is missing
      ['2026-11-18', 2, 3, 5], ['2026-11-19', 3, 3, 6], ['2026-11-20', 4, 4, 7]
    ];
    for (const [day, streak, best, total] of steps) {
      await duck(page, 'claim', day, 0);
      const d = await daysOf(page);
      assert.deepEqual([d.last, d.streak, d.best, d.total], [day, streak, best, total], day);
    }
  });

  await test('days: the streak runs through the month end, New Year and a leap day', async () => {
    const page = await open();
    for (const run of [['2026-11-29', '2026-11-30', '2026-12-1'], ['2026-12-30', '2026-12-31', '2027-1-1', '2027-1-2'], ['2028-2-27', '2028-2-28', '2028-2-29', '2028-3-1']]) {
      await duck(page, 'storageClear', 'local');
      for (const day of run) await duck(page, 'claim', day, 0);
      const d = await daysOf(page);
      assert.deepEqual([d.last, d.streak, d.total], [run[run.length - 1], run.length, run.length], run.join(' '));
      assert.equal((await local(page, { gifts: null })).gifts.total, run.length, 'a gift for every one of them');
    }
  });

  await test('days: several tabs at once count the day once, and the ducklings grow once', async () => {
    const first = await open({ cfg: { ducklings: 3 } });
    await duck(first, 'storageSet', 'local', {
      days: { last: '2026-11-13', streak: 4, best: 6, total: 20 }, gifts: { last: '2026-11-13', total: 3, counts: { shell: 3 } },
      brood: { ages: [1, 5, 9, 4, 4, 4, 4, 4], fledged: 2 }
    });
    await close(first);
    const pages = await Promise.all([1, 2, 3].map(() => open({ hash: '#clock=2026-11-14T09:00:00', claims: true, cfg: { ducklings: 3 } })));
    const replies = await Promise.all(pages.map((p) => duck(p, 'claim', '2026-11-14', 0)));
    assert.equal(replies.filter((r) => r && r.gift).length, 1, JSON.stringify(replies));
    assert.equal(replies.filter((r) => r && r.ages).length, 1, 'one of them was told about the growth');
    await sleep(4500);                                       // the tabs' own claims come and find nothing left to do
    const d = await daysOf(pages[2]);
    assert.deepEqual([d.last, d.streak, d.best, d.total], ['2026-11-14', 5, 6, 21]);
    const b = await broodOf(pages[2]);
    assert.deepEqual(b.ages, [2, 6, 10, 4, 4, 4, 4, 4], 'the three that are out, one day each');
    assert.equal(b.fledged, 2);
  });

  await test('days: a tab left open past midnight counts the new day when its owner is back', async () => {
    const page = await open({ hash: '#clock=2026-11-20T23:59:30', claims: true });
    await duck(page, 'storageSet', 'local', {
      days: { last: '2026-11-20', streak: 7, best: 7, total: 7 }, gifts: { last: '2026-11-20', total: 7, counts: { pebble: 7 } }
    });
    await sleep(1200);
    await duck(page, 'setClock', '2026-11-21T00:00:10');
    await duck(page, 'setEngine', 'pointerIdle', 300);       // nobody at the mouse
    await sleep(2500);
    assert.equal((await daysOf(page)).streak, 7, 'an empty room is not a day together');
    await page.mouse.move(500, 300, { steps: 4 });
    const d = await until(async () => { const v = await daysOf(page); return v.streak === 8 ? v : null; }, 'the day when somebody is back', 6000);
    assert.deepEqual([d.last, d.total], ['2026-11-21', 8]);
  });

  await test('days: not on a paused site and not while switched off', async () => {
    let page = await open();
    const before = { days: { last: '2026-11-10', streak: 2, best: 2, total: 2 }, gifts: { last: '2026-11-10', total: 2, counts: { pebble: 2 } } };
    await duck(page, 'storageSet', 'local', before);
    await close(page);
    page = await open({ hash: '#clock=2026-11-11T09:00:00', claims: true, cfg: { disabledHosts: ['127.0.0.1'] } });
    await sleep(4500);
    assert.equal((await daysOf(page)).total, 2, 'paused site');
    await duck(page, 'storageSet', 'sync', { disabledHosts: [], enabled: false });
    await sleep(4500);
    assert.equal((await daysOf(page)).total, 2, 'switched off');
    await duck(page, 'storageSet', 'sync', { enabled: true });
    await until(async () => (await daysOf(page)).total === 3, 'the day once she is on the page', 8000);
    assert.equal((await daysOf(page)).streak, 3);
  });

  await test('migration: the first visit after the update takes the 1.9.0 streak along', async () => {
    let page = await open();
    await as190(page, { streakDays: 12, streakLast: '2026-11-12' }, { last: '2026-11-12', total: 8, counts: { pebble: 8 } });
    await close(page);
    page = await open({ hash: '#clock=2026-11-13T09:00:00', claims: true, cfg: { ducklings: 2 } });
    await as190(page, { streakDays: 12, streakLast: '2026-11-12' }, { last: '2026-11-12', total: 8, counts: { pebble: 8 } });
    await page.mouse.move(600, 400);
    const d = await until(() => daysOf(page), 'the new record', 9000);
    assert.deepEqual([d.last, d.streak, d.best, d.total], ['2026-11-13', 13, 13, 13]);
    const b = await broodOf(page);
    assert.deepEqual(b.ages.slice(0, 3), [1, 6, 10], 'the starting family, the two that are out a day older');
    assert.equal((await local(page, { gifts: null })).gifts.total, 9);
    const stats = (await local(page, { stats: null })).stats;
    assert.equal(stats.pets, 3, 'the play counters are left alone');
    assert.deepEqual(page.errors, []);
  });

  await test('migration: updated on a day 1.9.0 had counted, the record is written and nothing counted twice', async () => {
    const page = await open({ hash: '#clock=2026-11-13T15:00:00' });
    await as190(page, { streakDays: 5, streakLast: '2026-11-13' }, { last: '2026-11-13', total: 5, counts: { shell: 5 } });
    const res = await duck(page, 'claim', '2026-11-13', 0);
    assert.equal(res.gift, null);
    assert.deepEqual(res.news, []);
    const d = await daysOf(page);
    assert.deepEqual([d.last, d.streak, d.best, d.total], ['2026-11-13', 5, 5, 5]);
    assert.deepEqual((await broodOf(page)).ages.slice(0, 4), [0, 5, 10, 15], 'nobody grew: the day was spent already');
    // the next day goes on from there
    await duck(page, 'claim', '2026-11-14', 0);
    assert.equal((await daysOf(page)).streak, 6);
  });

  await test('migration: a fresh install starts everything at nothing', async () => {
    const page = await open();
    await duck(page, 'storageClear', 'local');
    const res = await duck(page, 'claim', '2026-11-13', 0);
    assert.ok(res.gift, 'a first gift');
    const all = await local(page, null);
    assert.deepEqual([all.days.streak, all.days.best, all.days.total, all.gifts.total, all.brood.fledged], [1, 1, 1, 1, 0]);
    assert.equal(all.stats, undefined, 'the counters are the page\'s to write');
  });

  await test('migration: damaged records in storage are mended instead of spreading', async () => {
    const page = await open({ cfg: { ducklings: 3 } });
    await duck(page, 'storageSet', 'local', {
      days: { last: 17, streak: 'x', best: -4, total: null }, brood: { ages: ['a', null, 99], fledged: 'y' },
      gifts: { last: '2026-11-13', total: 1, counts: { pebble: 1 } }
    });
    const res = await duck(page, 'claim', '2026-11-13', 0);
    assert.equal(res.gift, null);
    const d = await daysOf(page), b = await broodOf(page);
    assert.deepEqual([d.last, d.streak, d.best, d.total], ['2026-11-13', 1, 1, 1]);
    assert.ok(b.ages.every((a) => Number.isInteger(a) && a >= 0 && a < 18), JSON.stringify(b.ages));
    // the first two got their starting ages and this day on top; the one with the impossible
    // age counted as nearly grown, so today she left
    assert.deepEqual([b.ages.slice(0, 3), b.fledged], [[1, 6, 0], 1]);
    // and a claim that isn't a date changes nothing: no day, no growth, no gift
    const before = await local(page, null);
    for (const bad of ['tomorrow', '', '2026-13-40', null]) {
      const r = await duck(page, 'claim', bad, 0);
      assert.deepEqual(r, { gift: null, news: [] }, String(bad));
    }
    assert.deepEqual(await local(page, null), before);
    // the real day still gets what it is due afterwards
    assert.ok((await duck(page, 'claim', '2026-11-14', 0)).gift, 'the next day brings its gift');
    const s = await state(page);
    assert.ok(s.babies.every((k) => k.r > 0 && k.stage >= 0), 'the ducklings on the page are fine');
  });

  console.log('Ducklings that grow up');

  await test('brood: every duckling shows the stage of her age', async () => {
    const page = await open({ cfg: { ducklings: 4, model: 'pirate' } });
    await duck(page, 'storageSet', 'local', { brood: { ages: [0, 4, 8, 14, 0, 0, 0, 0], fledged: 0 } });
    const s = await until(async () => { const v = await state(page); return v.babies.length === 4 && v.babies[3].stage === 3 ? v : null; }, 'the family', 3000);
    assert.deepEqual(s.babies.map((b) => b.stage), [0, 1, 2, 3]);
    for (let i = 1; i < 4; i++) {
      assert.ok(s.babies[i].r > s.babies[i - 1].r, 'bigger with every stage');
      assert.ok(s.babies[i].neck > s.babies[i - 1].neck, 'and longer in the neck');
      assert.ok(s.babies[i].gap - s.babies[i - 1].gap > s.babies[i - 1].gap - (i > 1 ? s.babies[i - 2].gap : 0), 'with more room in the row');
    }
    assert.ok(Math.abs(s.babies[0].r - s.r * 0.55) < 0.01, 'the fluffball is the size the ducklings always were');
    assert.ok(s.babies[3].r < s.r, 'and none is as big as mama');
    assert.ok(s.babies.every((b) => b.hat === null), 'mama keeps her pirate hat to herself');
    // another model: same ages, same stages
    await duck(page, 'storageSet', 'sync', { model: 'swan' });
    const s2 = await until(async () => { const v = await state(page); return v.cfg.model === 'swan' ? v : null; }, 'the swan', 2000);
    assert.deepEqual(s2.babies.map((b) => b.stage), [0, 1, 2, 3]);
    // fewer and more ducklings: each one keeps her own age
    await duck(page, 'storageSet', 'sync', { ducklings: 2 });
    await until(async () => (await state(page)).babies.length === 2, 'two', 2000);
    await duck(page, 'storageSet', 'sync', { ducklings: 4 });
    const s3 = await until(async () => { const v = await state(page); return v.babies.length === 4 ? v : null; }, 'four again', 2000);
    assert.deepEqual(s3.babies.map((b) => b.stage), [0, 1, 2, 3]);
    assert.deepEqual(page.errors, []);
  });

  await test('brood: a new day lets the ones that are out grow, on the page and in storage', async () => {
    let page = await open();
    const setup = {
      days: { last: '2026-11-13', streak: 2, best: 2, total: 2 }, gifts: { last: '2026-11-13', total: 2, counts: { pebble: 2 } },
      brood: { ages: [2, 6, 11, 2, 2, 2, 2, 2], fledged: 0 }
    };
    await duck(page, 'storageSet', 'local', setup);
    await close(page);
    page = await open({ hash: '#clock=2026-11-14T09:00:00', claims: true, cfg: { ducklings: 3 } });
    await duck(page, 'storageSet', 'local', setup);
    await page.mouse.move(600, 400);
    const before = await state(page);
    assert.deepEqual(before.babies.map((b) => b.stage), [0, 1, 2]);
    await until(async () => (await daysOf(page)).streak === 3, 'the new day', 9000);
    assert.deepEqual((await broodOf(page)).ages, [3, 7, 12, 2, 2, 2, 2, 2], 'the fourth stays at home and stays as she is');
    // each of the three gets her moment, one after the other, once the gift is on the water
    const seen = [];
    const done = await until(async () => {
      const v = await state(page);
      seen.push(v.babies.map((b) => b.stage).join(''));
      return v.brood.queue.length === 0 && v.babies[2].stage === 3 ? v : null;
    }, 'three growth spurts', 20000, 100);
    assert.deepEqual(done.babies.map((b) => b.stage), [1, 2, 3]);
    assert.deepEqual(done.brood.shown.slice(0, 3), [3, 7, 12]);
    assert.deepEqual([...new Set(seen)], ['012', '112', '122', '123'], 'one at a time, front to back');
    assert.equal(done.state === 'gift', false);
    assert.deepEqual(page.errors, []);
  });

  await test('brood: grown up, she flies off and a new one hatches from an egg in her place', async () => {
    let page = await open();
    const setup = {
      days: { last: '2026-11-13', streak: 2, best: 2, total: 2 }, gifts: { last: '2026-11-14', total: 2, counts: { pebble: 2 } },
      brood: { ages: [17, 5, 2, 2, 2, 2, 2, 2], fledged: 4 }
    };
    await duck(page, 'storageSet', 'local', setup);
    await close(page);
    page = await open({ hash: '#clock=2026-11-14T09:00:00', claims: true, cfg: { ducklings: 2 } });
    await duck(page, 'storageSet', 'local', setup);
    await page.mouse.move(600, 400);
    const kid = (await state(page)).babies[0];
    assert.equal(kid.stage, 3);
    const f = await until(async () => (await state(page)).fledge, 'her farewell', 12000, 40);
    assert.ok(Math.hypot(f.x - kid.x, f.y - kid.y) < 120, 'where she was swimming');
    const b = await broodOf(page);
    assert.deepEqual([b.ages[0], b.ages[1], b.fledged], [0, 6, 5]);
    // up and away, fading; her sister stays who she is
    const up = await until(async () => { const v = await state(page); return v.fledge && v.fledge.rise > 30 ? v : null; }, 'the take-off', 4000, 30);
    assert.equal(up.babies[1].stage, 1);
    assert.ok(up.stage.w * up.stage.h <= 900 * 720, `the stage follows her up, not across the page: ${up.stage.w}x${up.stage.h}`);
    await until(async () => { const v = await state(page); return v.fledge === null && v.babies[0].egg !== null && v.babies[0].egg >= 0; }, 'the egg in her place', 5000, 40);
    const out = await until(async () => { const v = await state(page); return v.babies[0].egg === null ? v : null; }, 'the hatchling', 5000, 40);
    assert.equal(out.babies[0].stage, 0);
    assert.ok(Math.abs(out.babies[0].r - out.r * 0.55) < 0.01, 'a fluffball');
    await sleep(600);
    const calm = await state(page);
    assert.deepEqual([calm.fledge, calm.brood.queue.length, calm.babies[0].vanish], [null, 0, 0]);
    assert.deepEqual(page.errors, []);
  });

  await test('brood: what happened in another tab arrives without the ceremony', async () => {
    const page = await open({ cfg: { ducklings: 2 } });
    await duck(page, 'storageSet', 'local', { brood: { ages: [2, 17, 0, 0, 0, 0, 0, 0], fledged: 0 }, days: { last: '2026-11-13', streak: 1, best: 1, total: 1 } });
    await until(async () => (await state(page)).babies[1].stage === 3, 'the family', 2000);
    // the claim is made elsewhere: this page only sees storage change
    await duck(page, 'claim', '2026-11-14', 0);
    const s = await until(async () => { const v = await state(page); return v.babies[0].stage === 1 && v.babies[1].stage === 0 ? v : null; }, 'the new looks', 2000);
    assert.deepEqual([s.fledge, s.brood.queue.length, s.babies[1].egg], [null, 0, null]);
    assert.equal((await broodOf(page)).fledged, 1);
  });

  await test('brood: the ceremony waits while she is under water, and while they are in the nest', async () => {
    const page = await open({ cfg: { ducklings: 2 } });
    await settle(page);
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).submerged, 'dive', 2000);
    await duck(page, 'setBrood', [3, 0, 0, 0, 0, 0, 0, 0], [{ slot: 0, kind: 'grow', stage: 1 }, { slot: 1, kind: 'fledge' }]);
    await sleep(2500);
    let s = await state(page);
    assert.deepEqual([s.brood.queue.length, s.fledge], [2, null], 'nothing happens down there');
    await page.keyboard.press('Escape');
    // they come up one after the other: each ceremony starts with its duckling in view, not on empty water
    const starts = [];
    s = await until(async () => {
      const v = await state(page);
      if (v.brood.queue.length < 2 - starts.length) starts.push(v);
      return v.brood.queue.length === 0 && !v.fledge && v.babies[1].egg === null ? v : null;
    }, 'both ceremonies', 15000, 25);
    assert.equal(starts.length, 2);
    assert.ok(starts[0].babies[0].vanish === 0 && starts[0].babies[0].submerge < 0.5, 'the first is up for her growth spurt: ' + JSON.stringify(starts[0].babies[0]));
    assert.notEqual(starts[0].state, 'surface', 'and mama has finished coming up');
    assert.equal(starts[0].submerged, false);
    assert.deepEqual(s.babies.map((b) => b.stage), [1, 0]);
    // tucked in for the night: nobody is woken for a growth spurt
    await duck(page, 'trigger', 'sleep');
    await until(async () => (await state(page)).state === 'sleep', 'her nap', 12000);
    await duck(page, 'setBrood', [7, 0, 0, 0, 0, 0, 0, 0], [{ slot: 0, kind: 'grow', stage: 2 }]);
    await sleep(2500);
    s = await state(page);
    assert.deepEqual([s.brood.queue.length, s.babies[0].stage, s.state], [1, 1, 'sleep']);
    await page.mouse.move(640, 430, { steps: 4 });
    s = await until(async () => { const v = await state(page); return v.brood.queue.length === 0 && v.babies[0].stage === 2 ? v : null; }, 'the spurt once they are up', 9000);
    assert.deepEqual(page.errors, []);
  });

  await test('brood: sent under water mid-ceremony, the egg waits and hatches once they are back', async () => {
    const page = await open({ cfg: { ducklings: 1 } });
    await settle(page);
    await duck(page, 'setBrood', [0, 0, 0, 0, 0, 0, 0, 0], [{ slot: 0, kind: 'fledge' }]);
    await until(async () => (await state(page)).fledge, 'her farewell', 5000, 40);
    await page.keyboard.press('Escape');
    const under = await until(async () => { const v = await state(page); return v.parked ? v : null; }, 'the scene to empty', 8000);
    assert.equal(under.fledge, null, 'she left with the dive');
    const t0 = under.babies[0].egg;
    assert.ok(t0 !== null && t0 < 2, 'the egg is still an egg: ' + t0);
    await sleep(3000);
    assert.equal((await state(page)).babies[0].egg, t0, 'and its clock stands still down there');
    await page.keyboard.press('Escape');
    const out = await until(async () => { const v = await state(page); return !v.submerged && v.babies[0].egg === null ? v : null; }, 'the hatchling', 9000, 50);
    assert.deepEqual([out.babies[0].stage, out.babies[0].vanish], [0, 0]);
    assert.deepEqual(page.errors, []);
  });

  await test('brood: under reduced motion she fades where she swims, and the egg does not rock', async () => {
    const page = await open({ cfg: { ducklings: 1 } });
    await settle(page);
    await duck(page, 'setBrood', [17, 0, 0, 0, 0, 0, 0, 0]);
    await duck(page, 'apply', { reduceMotion: true });
    await duck(page, 'setBrood', [0, 0, 0, 0, 0, 0, 0, 0], [{ slot: 0, kind: 'fledge' }]);
    let highest = 0, faded = false;
    await until(async () => {
      const v = await state(page);
      if (v.fledge) { highest = Math.max(highest, v.fledge.rise); if (v.fledge.alpha < 0.5) faded = true; }
      return v.brood.queue.length === 0 && !v.fledge && v.babies[0].egg === null && v.babies[0].stage === 0;
    }, 'the quiet version', 12000, 40);
    assert.equal(highest, 0, 'no take-off');
    assert.ok(faded, 'she fades out instead');
  });

  await test('brood: big ducklings still fit the nest, and mama gets to sleep', async () => {
    const page = await open({ cfg: { ducklings: 6, sleepAfter: 5 } });
    await duck(page, 'setBrood', [14, 15, 16, 17, 13, 12, 0, 0]);
    await settle(page);
    await duck(page, 'trigger', 'sleep');
    const s = await until(async () => { const v = await state(page); return v.state === 'sleep' ? v : null; }, 'her nap after tucking six big ones in', 16000);
    assert.equal(s.babies.length, 6);
    assert.deepEqual(page.errors, []);
  });

  console.log('Autumn migration');

  // A flock on its way, with nothing else going on around her.
  async function quietPond(page) {
    await duck(page, 'setEngine', 'fishCd', 999);
    await duck(page, 'setEngine', 'visitorCd', 999);
    await duck(page, 'setEngine', 'leafCd', 999);
  }

  await test('birds: on their own only from September through November', async () => {
    for (const [iso, expected] of [
      ['2026-08-31T12:00:00', false], ['2026-09-01T12:00:00', true], ['2026-10-15T12:00:00', true],
      ['2026-11-13T12:00:00', true], ['2026-11-30T23:30:00', true], ['2026-12-01T00:30:00', false], ['2027-04-10T12:00:00', false]
    ]) {
      const page = await open({ hash: '#clock=' + iso, cfg: { playfulness: 1 } });
      await noGiftToday(page);
      await quietPond(page);
      await duck(page, 'flockNow');
      await sleep(250);
      const c = await state(page);
      assert.equal(!!c.flock, expected, iso);
      assert.ok(c.flockCd > 400, 'and the next ones are minutes away: ' + c.flockCd);
      await close(page);
    }
  });

  await test('birds: not on their own under reduced motion, with effects off, at low playfulness or while she is hidden', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00', cfg: { playfulness: 1 } });
    await noGiftToday(page);
    await quietPond(page);
    await settle(page);
    const none = async (why) => {
      await duck(page, 'flockNow');
      await sleep(250);
      const c = await state(page);
      assert.equal(c.flock, null, why);
      assert.equal(c.sky, null, why + ': no layer either');
    };
    await duck(page, 'apply', { reduceMotion: true });
    await none('reduced motion');
    await duck(page, 'apply', { reduceMotion: false, effects: false });
    await none('effects off');
    await duck(page, 'apply', { effects: true, playfulness: 0.2 });
    await none('low playfulness');
    await duck(page, 'apply', { playfulness: 1 });
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).submerged, 'dive', 2000);
    await none('hidden with Esc');
    await page.keyboard.press('Escape');
    await until(async () => !(await state(page)).submerged, 'back', 2000);
    await duck(page, 'flockNow');
    await until(async () => (await state(page)).flock, 'and on again', 1500);
  });

  await test('birds: rare by default, the first minutes of a page stay empty', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00', cfg: { playfulness: 1 } });
    const c = await state(page);
    assert.ok(c.flockCd >= 85 && c.flockCd <= 240, 'first flock after ' + c.flockCd + ' s');
    assert.equal(c.flock, null);
    assert.equal(c.sky, null, 'no second layer on the page while nothing flies');
  });

  await test('birds: they cross the top on a layer of their own, and the page never notices', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00' });
    await noGiftToday(page);
    await quietPond(page);
    await page.mouse.move(700, 520);
    await duck(page, 'place', 620, 540);
    await sleep(900);
    const idle = await state(page);
    const over0 = await duck(page, 'overflow');
    await duck(page, 'trigger', 'birds');
    const xs = [], samples = [];
    await until(async () => {
      const v = await state(page);
      if (!v.flock) return samples.length > 5;
      if (v.sky) {
        samples.push(v);
        xs.push(v.flock.x * v.flock.dir);
      }
      return false;
    }, 'the flock to cross', 22000, 60);
    assert.ok(samples.length > 20, 'watched it cross: ' + samples.length + ' samples');
    for (const v of samples) {
      assert.equal(v.sky.layers, 1);
      assert.equal(v.sky.position, 'fixed');
      assert.equal(v.sky.pointerEvents, 'none');
      assert.ok(v.sky.w <= 220 && v.sky.h <= 150, `a small layer: ${v.sky.w}x${v.sky.h}`);
      assert.ok(v.sky.y >= 0 && v.sky.y + v.sky.h <= 190, `along the top edge: ${v.sky.y}..${v.sky.y + v.sky.h}`);
      assert.ok(v.flock.n >= 5 && v.flock.n <= 7, 'a small V: ' + v.flock.n);
      // her own stage stays where she is, as small as when nothing flies
      assert.ok(v.stage.w * v.stage.h <= Math.max(idle.stage.w * idle.stage.h * 1.6, 448 * 384), `stage ${v.stage.w}x${v.stage.h}, idle ${idle.stage.w}x${idle.stage.h}`);
      assert.ok(v.stage.h < 500, 'and never reaches up to the birds: ' + v.stage.h);
    }
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] >= xs[i - 1] - 0.01, 'always onward');
    assert.ok(xs[xs.length - 1] - xs[0] > 600, 'all the way across');
    assert.ok(samples.some((v) => v.sky.ink > 150), 'and they are painted: ' + Math.max(...samples.map((v) => v.sky.ink)));
    assert.deepEqual(await duck(page, 'overflow'), over0, 'no scrollbar came or went');
    const end = await state(page);
    assert.deepEqual([end.flock, end.sky], [null, null], 'gone, layer and all');
    // and with them gone the scene is calm again
    await sleep(1500);
    await duck(page, 'countFrames');
    await sleep(1000);
    const fps = await duck(page, 'frames');
    assert.ok(fps <= 40, `back to the calm rate: ${fps} fps, busy ${JSON.stringify(await duck(page, 'busyFrames'))}`);
    assert.deepEqual(page.errors, []);
  });

  await test('birds: a click on a link under the flock is the page\'s click', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00' });
    await noGiftToday(page);
    await quietPond(page);
    await page.mouse.move(700, 520);
    await duck(page, 'place', 620, 540);
    const link = await page.evaluate(() => { const r = document.getElementById('link').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    // several flocks if need be: each takes its own height, and this one has to pass over the link
    let over = null;
    for (let round = 0; round < 6 && !over; round++) {
      await duck(page, 'trigger', 'birds');
      over = await until(async () => {
        const v = await state(page);
        if (!v.flock) return 'gone';
        return v.sky && v.sky.x < link.x - 8 && v.sky.x + v.sky.w > link.x + 8 && v.sky.y < link.y - 4 && v.sky.y + v.sky.h > link.y + 4 ? v : null;
      }, 'the flock over the link', 22000, 25);
      if (over === 'gone') over = null;
    }
    assert.ok(over, 'a flock passed over the link');
    const top = await page.evaluate((p) => { const el = document.elementFromPoint(p.x, p.y); return el && el.id; }, link);
    assert.equal(top, 'link', 'the page still finds its link under the layer');
    await page.mouse.click(link.x, link.y);
    await sleep(80);
    const log = await page.evaluate(() => ({ click: window.__log.click, hash: location.hash }));
    assert.deepEqual(log.click, ['link']);
    assert.equal(log.hash, '#clicked');
  });

  await test('birds: she looks up, follows them and calls after them twice; it counts once', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00', cfg: { ducklings: 2 } });
    await noGiftToday(page);
    await quietPond(page);
    await settle(page, 600, 480);
    await duck(page, 'trigger', 'birds');
    const w = await until(async () => { const v = await state(page); return v.state === 'birdwatch' ? v : null; }, 'her to notice', 9000, 40);
    assert.ok(w.flock.prog > 0.09 && w.flock.prog < 0.8, 'once they are well in view: ' + w.flock.prog);
    const up = await until(async () => { const v = await state(page); return v.state === 'birdwatch' && v.headRot < -0.3 ? v : null; }, 'her beak to go up', 2500, 40);
    assert.equal(up.face, up.flock.x > up.x ? 1 : -1, 'turned toward them');
    assert.ok(up.babies.every((b) => b.headRot <= -0.4), 'the ducklings look up with her');
    assert.ok(up.speed < 40, 'and she has stopped to watch');
    const watched = [];
    const done = await until(async () => {
      const v = await state(page);
      if (v.state === 'birdwatch' && v.flock) watched.push(v);
      return v.calls >= 2 || !v.flock ? v : null;
    }, 'her two calls', 14000, 50);
    assert.equal(done.calls, 2);
    assert.equal(done.stats.flocks, 1);
    assert.ok(done.flock.called);
    assert.equal(done.flock.looks, 1, 'one look, start to finish');
    // she keeps facing them all the way (right overhead either side is fine), beak up
    for (const v of watched) {
      if (Math.abs(v.flock.x - v.x) > v.r) assert.equal(v.face, v.flock.x > v.x ? 1 : -1, 'facing them at ' + v.flock.prog.toFixed(2));
    }
    assert.ok(watched.filter((v) => v.headRot < -0.25).length > watched.length * 0.7, 'beak up most of the time');
    // and both calls came once they had passed her, or were nearly gone
    assert.ok((done.flock.x - done.x) * done.flock.dir > 0 || done.flock.prog > 0.7, 'she called after them');
    const after = await until(async () => { const v = await state(page); return !v.flock ? v : null; }, 'them to leave', 14000, 80);
    await until(async () => (await state(page)).state !== 'birdwatch', 'her to get on with her day', 2000);
    assert.equal((await state(page)).stats.flocks, 1, 'one flock, one count');
    assert.equal(after.sky, null);
    assert.deepEqual(page.errors, []);
  });

  await test('birds: asleep she lets them pass, and a moving cursor takes her along', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00' });
    await noGiftToday(page);
    await quietPond(page);
    await settle(page, 600, 480);
    await duck(page, 'trigger', 'sleep');
    await until(async () => (await state(page)).state === 'sleep', 'nap', 3000);
    await duck(page, 'trigger', 'birds');
    await until(async () => { const v = await state(page); return v.flock && v.flock.prog > 0.5; }, 'half way', 12000);
    let s = await state(page);
    assert.equal(s.state, 'sleep');
    assert.equal(s.stats.flocks || 0, 0);
    await duck(page, 'setEngine', 'flock', null);
    await sleep(120);
    assert.equal((await state(page)).sky, null, 'the layer goes with the flock');
    // awake and watching, then the cursor moves off: she follows it, not the birds
    await page.mouse.move(610, 470, { steps: 3 });
    await settle(page, 600, 480);
    await duck(page, 'trigger', 'birds');
    await until(async () => (await state(page)).state === 'birdwatch', 'her to watch', 9000, 40);
    await page.mouse.move(150, 650, { steps: 12 });
    await until(async () => (await state(page)).state !== 'birdwatch', 'her to come along', 3000, 40);
    await until(async () => { const v = await state(page); return Math.hypot(v.x - 150, v.y - 650) < v.r * 4; }, 'her to arrive', 9000);
    assert.deepEqual(page.errors, []);
  });

  await test('birds: with the cursor on the move she stays with it, and says “!” at most once', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00' });
    await noGiftToday(page);
    await quietPond(page);
    await settle(page, 300, 500);
    await duck(page, 'countSays');
    await duck(page, 'trigger', 'birds');
    // long sweeps to and fro, well ahead of her, for the whole crossing
    let looks = 0, watching = 0, samples = 0, i = 0;
    await until(async () => {
      i++;
      await page.mouse.move(600 + Math.sin(i / 5) * 420, 430 + Math.cos(i / 7) * 160, { steps: 3 });
      const v = await state(page);
      if (!v.flock) return true;
      samples++;
      looks = Math.max(looks, v.flock.looks);
      if (v.state === 'birdwatch') watching++;
      return false;
    }, 'the flock to cross', 22000, 25);
    const end = await state(page);
    assert.ok(samples > 40, 'swept through the crossing: ' + samples);
    // her “!” for the birds has its own blue; a cursor that jumps far or swipes through her
    // gets the reactions it always got
    assert.ok(end.says.filter((t) => t === '! #59b6f7').length <= 1, 'bubbles: ' + JSON.stringify(end.says));
    // however the input arrives (in bursts, in Firefox), another look takes two seconds to come
    assert.ok(looks <= 6, 'no flicker in and out of watching: ' + looks + ' looks, ' + watching + ' of ' + samples + ' samples watching');
    assert.deepEqual(page.errors, []);
  });

  await test('birds: Esc, the off switch and a paused site take the flock with them', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00' });
    await noGiftToday(page);
    await quietPond(page);
    await settle(page);
    const inFlight = async () => {
      await duck(page, 'trigger', 'birds');
      await until(async () => (await state(page)).sky, 'the layer', 2000, 40);
    };
    await inFlight();
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).submerged, 'dive', 2000);
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-cursor-duck-sky]').length), 0, 'Esc');
    const parked = await until(async () => { const v = await state(page); return v.parked ? v : null; }, 'the scene to empty', 6000);
    assert.equal(parked.flock, null);
    await page.keyboard.press('Escape');
    await until(async () => !(await state(page)).submerged, 'back', 2000);
    await inFlight();
    await duck(page, 'storageSet', 'sync', { enabled: false });
    await until(() => page.evaluate(() => document.querySelectorAll('[data-cursor-duck-sky]').length === 0), 'switched off', 2000);
    await duck(page, 'storageSet', 'sync', { enabled: true });
    await until(async () => (await state(page)).running, 'on again', 2000);
    await inFlight();
    await duck(page, 'storageSet', 'sync', { disabledHosts: ['127.0.0.1'] });
    await until(() => page.evaluate(() => document.querySelectorAll('[data-cursor-duck-sky]').length === 0), 'paused site', 2000);
    await duck(page, 'storageSet', 'sync', { disabledHosts: [] });
    assert.deepEqual(page.errors, []);
  });

  await test('birds: a requested flock under reduced motion still crosses, and she keeps her wings still', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00' });
    await noGiftToday(page);
    await quietPond(page);
    await settle(page, 600, 480);
    await duck(page, 'apply', { reduceMotion: true });
    await duck(page, 'trigger', 'birds');
    const a = await until(async () => { const v = await state(page); return v.flock && v.sky && v.sky.ink > 100 ? v : null; }, 'the gliding flock', 3000, 40);
    const b = await until(async () => { const v = await state(page); return v.flock && v.flock.prog > a.flock.prog + 0.2 ? v : null; }, 'it to move on', 6000);
    assert.ok(b.flock.prog > a.flock.prog);
    let flapped = 0, watched = 0;
    const done = await until(async () => {
      const v = await state(page);
      if (v.state === 'birdwatch') { watched++; flapped = Math.max(flapped, v.wing); }
      return v.calls >= 2 || !v.flock ? v : null;
    }, 'her calls', 14000, 30);
    assert.equal(done.calls, 2, 'she still calls after them');
    assert.ok(watched > 10, 'and was watched doing it: ' + watched);
    assert.ok(flapped < 0.1, 'no wave with the second call: ' + flapped);
    assert.deepEqual(page.errors, []);
  });

  console.log('Quiet by default');

  await test('calm: idle at about 30 fps with a small stage, leaf or not', async () => {
    const page = await open({ hash: '#clock=2026-10-15T12:00:00' });
    await noGiftToday(page);
    // beside her: a cursor resting on her starts peekaboo, which rightly runs at full rate
    await page.mouse.move(700, 450);
    await duck(page, 'place', 620, 470);
    await sleep(1600);
    await duck(page, 'countFrames');
    await sleep(2000);
    const idle = await duck(page, 'frames') / 2;
    const s0 = await state(page);
    await duck(page, 'spawnLeafAt', s0.r * 4, 0);
    await sleep(300);
    await duck(page, 'countFrames');
    await sleep(2000);
    const withLeaf = await duck(page, 'frames') / 2;
    const s1 = await state(page);
    assert.ok(idle > 15 && idle < 40, `idle ${idle} fps`);
    assert.ok(withLeaf > 15 && withLeaf < 40, `with leaf ${withLeaf} fps`);
    assert.ok(s0.stage.w * s0.stage.h <= 512 * 512, `idle stage ${s0.stage.w}x${s0.stage.h}`);
    assert.ok(s1.stage.w * s1.stage.h <= s0.stage.w * s0.stage.h * 2.5, `leaf stage ${s1.stage.w}x${s1.stage.h}`);
    console.log(`       idle ${idle} fps on ${s0.stage.w}x${s0.stage.h}, with leaf ${withLeaf} fps on ${s1.stage.w}x${s1.stage.h}`);
  });

  console.log('Website');

  async function sitePage(pathname) {
    const ext = await open();
    await duck(ext, 'storageSet', 'sync', { disabledHosts: ['localhost'] });   // only the page's own duck here
    await close(ext);
    const page = await browser.newPage();
    openPages.add(page);
    await page.setViewport({ width: 1100, height: 720 }).catch(() => {});
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(String(e)));
    await page.goto(siteBase + pathname, { waitUntil: 'load' });
    await until(() => page.evaluate(() => !!window.__duck), 'the page duck');
    return page;
  }

  await test('site: counts, new cards and the tricks run on the real engine', async () => {
    const page = await sitePage('/');
    const info = await page.evaluate(() => ({
      ach: document.getElementById('statAch').textContent,
      tricks: document.getElementById('statTricks').textContent,
      cards: ['f15h', 'f16h', 'f17h', 'f18h', 'f19h', 'f20h', 'f21h'].map((k) => (document.querySelector('[data-i18n="' + k + '"]') || {}).textContent),
      log: false
    }));
    info.log = await until(() => page.evaluate(() => document.getElementById('timeline').textContent.includes('1.10.0')), 'the duck log', 3000);
    assert.equal(info.ach, '76');
    assert.equal(info.tricks, '21');
    assert.ok(info.cards.every(Boolean), JSON.stringify(info.cards));
    assert.ok(info.log, 'the duck log lists 1.10.0');
    assert.ok(await page.evaluate(() => document.getElementById('timeline').textContent.includes('1.9.0')), 'and still 1.9.0');
    // the hero's two ducklings are a fluffball and an older sister
    assert.deepEqual(await page.evaluate(() => window.__duck.babies.map((b) => b.stage)), [0, 1]);
    // (the label follows the browser's language, the bird doesn't)
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('#tricks button')].some((b) => b.textContent.includes('🕊'))), true);
    await page.evaluate(() => window.__duck.trigger('birds'));
    await until(() => page.evaluate(() => document.querySelectorAll('[data-cursor-duck-sky]').length === 1), 'the birds over the site', 2000);
    assert.ok(await page.evaluate(() => { const el = document.scrollingElement; return el.scrollWidth <= el.clientWidth; }), 'no sideways scroll');
    await page.evaluate(() => window.__duck.dropFlock());
    await page.evaluate(() => window.__duck.trigger('leaf'));
    assert.equal(await page.evaluate(() => !!window.__duck.leaf), true);
    await page.evaluate(() => window.__duck.trigger('gift'));
    assert.equal(await page.evaluate(() => window.__duck.duck.state), 'gift');
    await until(() => page.evaluate(() => !!window.__duck.giftObj), 'the gift', 5000);
    await page.mouse.move(500, 300);
    await sleep(300);
    await page.evaluate(() => window.__duck.trigger('quack'));
    await page.evaluate(() => { window.__duck.px = window.__duck.duck.x + 40; window.__duck.py = window.__duck.duck.y; });
    await page.keyboard.press('Escape');
    await until(() => page.evaluate(() => window.__duck.submerged), 'Esc on the site', 1500);
    await page.keyboard.press('Escape');
    await until(() => page.evaluate(() => !window.__duck.submerged), 'Esc again', 1500);
    assert.deepEqual(page.errors, []);
  });

  await test('site: the German start page carries the new cards and names', async () => {
    const page = await sitePage('/de/');
    const info = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      f15: document.querySelector('[data-i18n="f15h"]').textContent,
      f18: document.querySelector('[data-i18n="f18h"]').textContent,
      f19: document.querySelector('[data-i18n="f19h"]').textContent,
      f20: document.querySelector('[data-i18n="f20h"]').textContent,
      f21: document.querySelector('[data-i18n="f21h"]').textContent,
      name: window.__duck.giftName('shell'),
      stage: window.__duck.stageName('fluff'), grown: window.__duck.stageName('grown')
    }));
    assert.equal(info.lang, 'de');
    assert.equal(info.f15, 'Am Schlafittchen');
    assert.equal(info.f18, 'Treibende Blätter');
    assert.deepEqual([info.f19, info.f20, info.f21], ['Vogelzug im Herbst', 'Küken, die heranwachsen', 'Tage zusammen']);
    assert.equal(info.name, 'Muschel');
    assert.deepEqual([info.stage, info.grown], ['Flaumküken', 'Ausgewachsen']);
    assert.deepEqual(page.errors, []);
  });

  console.log('Soak');

  const soakSeen = {};
  for (const model of ['mallard', 'techie', 'tycoon']) {
    await test(`soak: 8 fast-forwarded minutes of random input, ${model}`, async () => {
      const page = await open({ hash: '#clock=2026-10-15T12:00:00' });
      await noGiftToday(page);
      await settle(page);
      await duck(page, 'countFrames');
      const r = await duck(page, 'soak', model.length * 7919, 8, model);
      assert.deepEqual(r.bad, []);
      for (const st in r.seen) soakSeen[st] = (soakSeen[st] || 0) + r.seen[st];
      const e = r.end;
      assert.equal(e.vanish, 0, JSON.stringify(e));
      assert.ok(e.submerge < 0.1, 'stuck under water: ' + JSON.stringify(e));
      assert.equal(e.babiesHidden, 0, JSON.stringify(e));
      assert.deepEqual([e.carry, e.giftRun, e.submerged, e.drag, e.hoard, e.laptop, e.buddy, e.disco],
        [null, false, false, false, false, false, false, false], JSON.stringify(e));
      // the birds have left with their layer, and every duckling looks her age
      assert.deepEqual([e.flock, e.sky, e.fledge, e.eggs, e.broodQ], [false, 0, false, 0, 0], JSON.stringify(e));
      assert.equal(e.shown, e.ages, JSON.stringify(e));
      assert.equal(await page.evaluate(() => document.querySelectorAll('[data-cursor-duck-sky]').length), 0);
      await duck(page, 'countFrames');
      await sleep(500);
      assert.ok(await duck(page, 'frames') > 5, 'the frame loop is still alive');
      assert.deepEqual(page.errors, []);
    });
  }

  await test('soak: between them, the runs went through naps and leaf tricks too', async () => {
    for (const st of ['dragged', 'dragback', 'hide', 'surface', 'gift', 'sleep', 'goldnap', 'codenap', 'tuckin', 'dance', 'burst', 'waddle',
      'birdwatch', 'egg', 'fledge']) {
      assert.ok(soakSeen[st] > 0, 'never reached ' + st + ': ' + JSON.stringify(soakSeen));
    }
  });

  await test('nap: she stays asleep at the far end of the keep-away slider', async () => {
    const page = await open({ cfg: { distance: 3 } });
    await page.mouse.move(800, 450);
    const r = (await state(page)).r;
    await duck(page, 'place', 800 - r * 1.9 * 3, 450);
    await sleep(100);
    await duck(page, 'trigger', 'sleep');
    await sleep(1200);
    assert.equal((await state(page)).state, 'sleep');
  });

  await test('calm: no listeners armed between presses', async () => {
    const page = await open();
    const s = await settle(page);
    const at = onHer(s);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.up();
    const c = await state(page);
    assert.equal(c.drag, null);
  });
}

// `npx @puppeteer/browsers install firefox@stable --path ~/.cache/puppeteer`, or FIREFOX_BIN
function firefoxPath() {
  if (process.env.FIREFOX_BIN) return process.env.FIREFOX_BIN;
  const cache = path.join(os.homedir(), '.cache', 'puppeteer', 'firefox');
  for (const dir of fs.existsSync(cache) ? fs.readdirSync(cache).sort().reverse() : []) {
    for (const rel of ['Firefox.app/Contents/MacOS/firefox', 'firefox/firefox', 'core/firefox.exe', 'firefox/firefox.exe']) {
      const bin = path.join(cache, dir, rel);
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;   // puppeteer's own lookup
}

// ── boot ────────────────────────────────────────────────────────────────
(async () => {
  const pkg = testPackage();
  const srv = await serve();
  const siteSrv = await serve(path.join(ROOT, '_site'));
  base = `http://127.0.0.1:${srv.address().port}`;
  siteBase = `http://localhost:${siteSrv.address().port}`;
  try {
    if (FIREFOX) {
      // system access: BiDi may only run scripts on moz-extension:// pages with it
      browser = await puppeteer.launch({
        browser: 'firefox', headless: true, executablePath: firefoxPath(),
        env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' }
      });
      await browser.installExtension(pkg);
    } else {
      browser = await puppeteer.launch({ headless: true, enableExtensions: [pkg], args: ['--no-first-run'] });
    }
    await sleep(800);
    await run();
  } catch (e) {
    console.error('harness failure:', e);
    results.push({ name: 'harness', ok: false, error: String(e) });
  } finally {
    await browser?.close().catch(() => {});
    srv.close();
    siteSrv.close();
    fs.rmSync(pkg, { recursive: true, force: true });
  }
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => r.ok === false);
  const skip = results.filter((r) => r.skipped).length;
  console.log(`\n${BROWSER}: ${ok} passed, ${bad.length} failed, ${skip} skipped`);
  fs.mkdirSync(path.join(HERE, 'out'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'out', `e2e-${BROWSER}.json`), JSON.stringify(results, null, 2));
  process.exit(bad.length ? 1 : 0);
})();
