// Idle load of two packaged versions, side by side, in a real (headed) Chrome.
//   node tests/perf.mjs [seconds per scene] [rounds]
// CPU from the DevTools protocol (SystemInfo.getProcessInfo, delta per process
// type), frames from a counter around render().
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const SECONDS = Number(process.argv[2] || 15);
const ROUNDS = Number(process.argv[3] || 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The release before, then the one being built. Scenes only the new one has are marked `fresh`.
const VERSIONS = [
  { label: '1.9.0', zip: 'dist/cursor-duck-chrome-1.9.0.zip' },
  { label: '1.10.0', zip: 'dist/cursor-duck-chrome-1.10.0.zip', fresh: true }
];

function unpack(zip) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-duck-perf-'));
  execFileSync('unzip', ['-q', path.join(ROOT, zip), '-d', dir]);
  fs.copyFileSync(path.join(HERE, 'bridge.js'), path.join(dir, 'src', 'test-bridge.js'));
  const mf = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  mf.content_scripts[0].js.unshift('src/test-bridge.js');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(mf, null, 2));
  return dir;
}

async function duck(page, cmd, ...args) {
  const raw = await page.evaluate((c, a) => new Promise((resolve) => {
    const id = Math.random();
    function on(ev) {
      if (!ev.data || ev.data.__duckTestReply !== id) return;
      window.removeEventListener('message', on);
      resolve(ev.data.value);
    }
    window.addEventListener('message', on);
    window.postMessage({ __duckTest: id, cmd: c, args: a }, '*');
  }), cmd, args);
  return JSON.parse(raw);
}

async function cpu(cdp) {
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
  const out = {};
  for (const p of processInfo) out[p.type] = (out[p.type] || 0) + p.cpuTime;
  return out;
}

async function measure(page, cdp, during) {
  await duck(page, 'countFrames');
  const a = await cpu(cdp);
  const t0 = Date.now();
  if (during) await during(); else await sleep(SECONDS * 1000);
  const secs = (Date.now() - t0) / 1000;
  const b = await cpu(cdp);
  const frames = await duck(page, 'frames');
  const s = await duck(page, 'state');
  return {
    renderer: ((b.renderer - a.renderer) / secs * 100),
    gpu: (((b.GPU || 0) - (a.GPU || 0)) / secs * 100),
    fps: frames / secs,
    stage: s.stage ? `${s.stage.w}x${s.stage.h}` : '-',
    canvas: `${s.canvas.w}x${s.canvas.h}`
  };
}

const CALM = { enabled: true, follow: true, peck: false, playfulness: 0, ducklings: 0, effects: true, sound: false, disabledHosts: [], sleepAfter: 60, distance: 1, size: 1, model: 'mallard' };

async function runVersion(v, srv) {
  const pkg = unpack(v.zip);
  const browser = await puppeteer.launch({
    headless: false, enableExtensions: [pkg], defaultViewport: { width: 1280, height: 800 },
    args: ['--no-first-run', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows']
  });
  const out = {};
  try {
    await sleep(800);
    const cdp = await browser.target().createCDPSession();
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${srv.address().port}/page.html`, { waitUntil: 'load' });
    for (const p of await browser.pages()) if (p !== page) await p.close();
    await page.bringToFront();
    await sleep(800);
    await duck(page, 'storageSet', 'sync', CALM);
    const day = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; });
    // today is settled: no gift, no day to count, nobody grows while the meter runs
    await duck(page, 'storageSet', 'local', { gifts: { last: day, total: 0, counts: {} }, days: { last: day, streak: 1, best: 1, total: 1 } });
    await duck(page, 'setEngine', 'leafCd', 1e9);
    // beside her: a cursor resting on her starts peekaboo at full frame rate
    await page.mouse.move(700, 450);
    await duck(page, 'place', 620, 470);
    await sleep(4000);
    out.rest = await measure(page, cdp);
    await duck(page, 'trigger', 'sleep');
    await sleep(3000);
    out.sleep = await measure(page, cdp);
    await page.mouse.move(690, 440);
    await sleep(2000);
    out.follow = await measure(page, cdp, async () => {
      const end = Date.now() + SECONDS * 1000;
      let i = 0;
      while (Date.now() < end) {
        i++;
        await page.mouse.move(640 + Math.sin(i / 14) * 340, 400 + Math.cos(i / 9) * 220);
        await sleep(16);
      }
    });
    await page.mouse.move(700, 450);
    await duck(page, 'place', 620, 470);
    await sleep(3500);
    const s = await duck(page, 'state');
    // a leaf out the whole time at its usual distance, on the side away from her path
    await duck(page, 'spawnLeafAt', -s.r * 4.5, 0);
    await duck(page, 'setEngine', 'leafCd', 1e9);
    await page.evaluate(() => {});
    out.leaf = await measure(page, cdp);
    await duck(page, 'setEngine', 'leaf', null);
    // three ducklings resting behind her: fluffballs before, since 1.10.0 at their ages
    await duck(page, 'storageSet', 'sync', { ducklings: 3 });
    await page.mouse.move(700, 450);
    await duck(page, 'place', 620, 470);
    await sleep(4500);
    out.family = await measure(page, cdp);
    await duck(page, 'storageSet', 'sync', { ducklings: 0 });
    await sleep(600);
    if (v.fresh) {
      // birds in the air the whole time, one flock after the other: far more than a page ever sees
      await page.mouse.move(700, 450);
      await duck(page, 'place', 620, 470);
      await sleep(3000);
      let flocks = 0;
      out.birds = await measure(page, cdp, async () => {
        const end = Date.now() + SECONDS * 1000;
        while (Date.now() < end) {
          const now = await duck(page, 'state');
          if (!now.flock) { await duck(page, 'trigger', 'birds'); flocks++; }
          await sleep(250);
        }
      });
      out.birds.note = flocks + ' flocks';
      await duck(page, 'setEngine', 'flock', null);
      await sleep(1500);
      // …and at rest again once they have gone
      out.after = await measure(page, cdp);
    }
    await page.keyboard.press('Escape');
    await sleep(3500);
    const hidden = await duck(page, 'state');
    out.hidden = await measure(page, cdp);
    out.hidden.note = hidden.parked ? 'parked' : 'NOT parked';
  } finally {
    await browser.close().catch(() => {});
    fs.rmSync(pkg, { recursive: true, force: true });
  }
  return out;
}

const srv = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(HERE, 'fixtures', path.normalize(url.pathname).replace(/^\/+/, '') || 'page.html');
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(buf);
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));

const all = {};
for (let round = 0; round < ROUNDS; round++) {
  // alternating order, so warm-up and thermal drift don't favour one side
  for (const v of round % 2 ? [...VERSIONS].reverse() : VERSIONS) {
    const r = await runVersion(v, srv);
    (all[v.label] = all[v.label] || []).push(r);
  }
}
srv.close();

const fmt = (n) => n.toFixed(1).padStart(5);
console.log(`\n${SECONDS} s per scene, ${ROUNDS} rounds, share of one core\n`);
console.log('version scene    renderer %   gpu %    fps   stage      canvas');
const summary = {};
for (const [label, rounds] of Object.entries(all)) {
  const scenes = Object.keys(rounds[rounds.length - 1]);
  for (const scene of scenes) {
    const rows = rounds.map((r) => r[scene]).filter(Boolean);
    const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
    const last = rows[rows.length - 1];
    console.log(`${label.padEnd(7)} ${scene.padEnd(8)} ${fmt(avg('renderer'))}      ${fmt(avg('gpu'))}  ${fmt(avg('fps'))}   ${last.stage.padEnd(10)} ${last.canvas} ${last.note || ''}`);
    (summary[label] = summary[label] || {})[scene] = { renderer: avg('renderer'), gpu: avg('gpu'), fps: avg('fps'), stage: last.stage, canvas: last.canvas, note: last.note };
  }
}
fs.mkdirSync(path.join(HERE, 'out'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'out', 'perf.json'), JSON.stringify(summary, null, 2));
process.exit(0);
