#!/usr/bin/env node
// Submit a Cursor Duck package to the Chrome Web Store from the command line.
//
//   node tools/cws-submit.mjs dist/cursor-duck-chrome-<version>.zip \
//        --note-en "1.8.1: Lower CPU use — …" --note-de "1.8.1: Weniger Prozessorlast — …"
//
// Options
//   --note-<lang> "…"   line appended to the description of that listing language
//                       (skipped when the description already contains it)
//   --no-submit         upload and edit, but do not submit for review
//   --no-auto-publish   untick "publish automatically after review" before submitting
//   --inspect           only report the draft/published versions, change nothing
//   --keep-profile      keep the temporary Chrome profile (it holds the Google session)
//   --port <n>          DevTools port (default 9333)
//   --chrome <path>     Chrome binary (default: macOS Google Chrome)
//   --item <id> --publisher <id>   another dashboard item
//
// The developer dashboard cannot be driven by browser extensions ("the
// extensions gallery cannot be scripted"), but for the DevTools protocol it is
// an ordinary web page.  This script starts a separate Chrome with its own
// profile and a debugging port, waits until you have signed in to the dashboard
// in that window, then uploads the package, appends the release line to the
// descriptions, saves, and submits the item for review.  Needs Node 22+ (global
// WebSocket) and a Chrome that is not already using the same profile.

import { spawn } from 'node:child_process';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// ---------------------------------------------------------------- arguments

const args = process.argv.slice(2);
const opts = { notes: {}, port: 9333, submit: true, autoPublish: true, inspect: false, keepProfile: false,
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  publisher: '613cecc2-5ed9-412b-8be6-03ff1d0350a5', item: 'hohfcnokdpmjggmicebcjalgjcfpfblg' };
let zip = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const note = /^--note-([a-z]{2}(?:-[A-Za-z]+)?)$/.exec(a);
  if (note) opts.notes[note[1].toLowerCase()] = args[++i];
  else if (a === '--no-submit') opts.submit = false;
  else if (a === '--no-auto-publish') opts.autoPublish = false;
  else if (a === '--inspect') opts.inspect = true;
  else if (a === '--keep-profile') opts.keepProfile = true;
  else if (a === '--port') opts.port = Number(args[++i]);
  else if (a === '--chrome') opts.chrome = args[++i];
  else if (a === '--item') opts.item = args[++i];
  else if (a === '--publisher') opts.publisher = args[++i];
  else if (a.startsWith('--')) fail('unknown option ' + a);
  else zip = resolve(a);
}
if (!opts.inspect && !zip) fail('usage: node tools/cws-submit.mjs dist/cursor-duck-chrome-<version>.zip [--note-en "…"] [--note-de "…"]');
if (zip && !existsSync(zip)) fail('package not found: ' + zip);
const expectedVersion = zip ? (/(\d+\.\d+\.\d+)/.exec(basename(zip)) || [])[1] : null;

const DASHBOARD = `https://chrome.google.com/webstore/devconsole/${opts.publisher}/${opts.item}/edit`;
const PROFILE = join(tmpdir(), 'cursor-duck-cws-profile');

function fail(msg) { console.error('cws-submit: ' + msg); process.exit(1); }
const log = (msg) => console.log('• ' + msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ Chrome

mkdirSync(PROFILE, { recursive: true });
const chrome = spawn(opts.chrome, [
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${opts.port}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1440,1000', '--window-position=60,40',
  DASHBOARD + '/package'
], { stdio: 'ignore' });
chrome.on('error', (e) => fail('could not start Chrome: ' + e.message));

let tab = null;
async function shutdown(code) {
  try { tab && tab.close(); } catch (e) { /* already gone */ }
  if (!chrome.killed) chrome.kill();
  await sleep(1500);
  if (!opts.keepProfile) {
    for (let i = 0; i < 5; i++) {
      try { rmSync(PROFILE, { recursive: true, force: true }); break; } catch (e) { await sleep(1000); }
    }
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(130));

async function json(path) {
  const r = await fetch(`http://localhost:${opts.port}${path}`);
  return r.json();
}

function cdp(url) {
  const ws = new WebSocket(url);
  let id = 0; const pending = new Map(); const listeners = new Map();
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method && listeners.has(m.method)) listeners.get(m.method)(m.params);
  };
  return {
    ready,
    send(method, params = {}) { return new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); }); },
    on(method, fn) { listeners.set(method, fn); },
    close() { ws.close(); }
  };
}

// ------------------------------------------------------------ page helpers

async function evaluate(expr) {
  const r = await tab.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
}
async function clickAt(x, y) {
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
// polls fn until it returns something truthy; errors while the page is
// navigating (no body yet, context destroyed) just mean "not yet"
async function waitFor(fn, label, timeoutMs = 30000, every = 500) {
  const end = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v; } catch (e) { lastError = e; }
    await sleep(every);
  }
  throw new Error('timeout waiting for ' + label + (lastError ? ' (last error: ' + lastError.message + ')' : ''));
}
const pageText = () => evaluate('(document.body && document.body.innerText) || ""');
const url = () => evaluate('location.href');

// first visible button whose text matches, as {cx, cy}; minY skips the header
const BUTTON = (re, minY) => `(function(){
  var b = Array.from(document.querySelectorAll('button')).filter(function(x){
    var r = x.getBoundingClientRect(); return r.width > 0 && r.y >= ${minY || 0} && ${re}.test(x.innerText.trim()); })[0];
  if (!b) return null; var r = b.getBoundingClientRect();
  return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), disabled: b.disabled, text: b.innerText.trim() };
})()`;
async function clickButton(re, label, minY) {
  const b = await waitFor(() => evaluate(BUTTON(re, minY)), label);
  await clickAt(b.cx, b.cy);
  return b;
}

const DESCRIPTION = `(function(){
  var tas = Array.from(document.querySelectorAll('textarea'));
  return tas.filter(function(t){ return t.maxLength === 16000; })[0] ||
         tas.sort(function(a, b){ return b.value.length - a.value.length; })[0] || null;
})()`;

async function versions() {
  const t = (await pageText()).replace(/\s+/g, ' ');
  return { draft: (/(?:Entwurf|Draft) Version (\S+)/.exec(t) || [])[1], published: (/(?:Veröffentlicht|Published) Version (\S+)/.exec(t) || [])[1] };
}
async function gotoPage(path) {
  await tab.send('Page.navigate', { url: DASHBOARD + path });
  await waitFor(async () => /Publisher:/.test(await pageText()), 'page ' + path);
  await sleep(1500);
}

// -------------------------------------------------------------------- flow

async function main() {
  await waitFor(() => json('/json/version'), 'Chrome to start', 15000, 200);
  const targets = await json('/json');
  const page = targets.find((t) => t.type === 'page' && /chrome\.google\.com|accounts\.google\.com/.test(t.url)) || targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target in Chrome');
  tab = cdp(page.webSocketDebuggerUrl);
  await tab.ready;
  await tab.send('Runtime.enable');
  await tab.send('Page.enable');

  log('Chrome window opened — sign in to the Chrome Web Store dashboard there if it asks you to');
  await waitFor(async () => (await url()).startsWith(DASHBOARD) && /Publisher:/.test(await pageText()), 'dashboard sign-in', 10 * 60 * 1000, 2000);
  log('signed in, dashboard loaded');

  let v = await versions();
  log(`draft ${v.draft || '–'} · published ${v.published || '–'}`);
  if (opts.inspect) return 0;

  // upload --------------------------------------------------------------
  if (expectedVersion && v.draft === expectedVersion) {
    log(`draft is already ${expectedVersion}, skipping the upload`);
  } else {
    await clickButton('/Neues Paket hochladen|Upload new package/i', 'upload button');
    const r = await waitFor(async () => {
      const x = await tab.send('Runtime.evaluate', { expression: `(function(){
        function deep(root, out){ out = out || []; root.querySelectorAll('*').forEach(function(el){ if (el.tagName === 'INPUT' && el.type === 'file') out.push(el); if (el.shadowRoot) deep(el.shadowRoot, out); }); return out; }
        return deep(document)[0] || null; })()`, returnByValue: false });
      return x.result.objectId ? x.result : null;
    }, 'file input of the upload dialog');
    await tab.send('DOM.getDocument', { depth: 0 });
    const node = await tab.send('DOM.requestNode', { objectId: r.objectId });
    await tab.send('DOM.setFileInputFiles', { files: [zip], nodeId: node.nodeId });
    log('uploading ' + basename(zip));
    await waitFor(async () => {
      const t = await pageText();
      if (/Problem aufgetreten|problem uploading/i.test(t)) throw new Error('the dashboard reported an upload problem');
      return !(await url()).endsWith('/package');
    }, 'upload to finish', 120000);
    await gotoPage('/package');
    v = await versions();
    log(`uploaded — draft ${v.draft} · published ${v.published}`);
    if (expectedVersion && v.draft !== expectedVersion) throw new Error(`draft version ${v.draft} does not match the package ${expectedVersion}`);
  }

  // descriptions --------------------------------------------------------
  const langs = Object.keys(opts.notes);
  if (langs.length) {
    await gotoPage('');
    for (const lang of langs) {
      // the language menu: the visible field that shows "… – en (…)"
      const trigger = await evaluate(`(function(){
        var els = Array.from(document.querySelectorAll('[role=combobox], [aria-haspopup=listbox], div, span')).filter(function(el){
          var r = el.getBoundingClientRect(); return r.width > 100 && r.width < 600 && r.height > 20 && r.height < 120 && /^[^\\n]{2,30} – [a-z]{2}(-[A-Za-z]+)? ?(\\(.*\\))?$/.test(el.innerText.trim()); });
        els.sort(function(a, b){ return a.getBoundingClientRect().height - b.getBoundingClientRect().height; });
        var el = els[0]; if (!el) return null; var r = el.getBoundingClientRect();
        return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), text: el.innerText.trim() };
      })()`);
      if (!trigger) throw new Error('language menu not found');
      if (!new RegExp('– ' + lang + '\\b').test(trigger.text)) {
        await clickAt(trigger.cx, trigger.cy);
        const option = await waitFor(() => evaluate(`(function(){
          var o = Array.from(document.querySelectorAll('[role=option]')).filter(function(x){
            var r = x.getBoundingClientRect(); return r.width > 0 && /– ${lang}\\b/.test(x.innerText); })[0];
          if (!o) return null; var r = o.getBoundingClientRect();
          return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) }; })()`), 'language option ' + lang, 10000);
        await clickAt(option.cx, option.cy);
        await waitFor(async () => new RegExp('– ' + lang + '\\b').test((await pageText()).replace(/\s+/g, ' ').split(/Produktdetails|Product details/)[1] || ''), 'listing to switch to ' + lang, 15000);
        await sleep(1000);
      }
      const line = opts.notes[lang];
      const res = await evaluate(`(function(){
        var t = ${DESCRIPTION}; if (!t) return { err: 'no description field' };
        var line = ${JSON.stringify(line)};
        if (t.value.indexOf(line) >= 0) return { already: true, len: t.value.length };
        var set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        t.focus(); set.call(t, t.value.replace(/\\s+$/, '') + '\\n\\n' + line);
        t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); t.blur();
        return { len: t.value.length, ok: t.value.slice(-line.length) === line };
      })()`);
      if (res.err) throw new Error(res.err);
      if (res.already) { log(`${lang}: description already contains the line (${res.len} chars)`); continue; }
      if (!res.ok) throw new Error(lang + ': could not append the line');
      await clickButton('/^(Speichern|Save)$/', 'save button');
      await waitFor(async () => { const b = await evaluate(BUTTON('/^(Speichern|Save)$/')); return b && b.disabled; }, 'save of ' + lang, 20000);
      log(`${lang}: description saved (${res.len} chars)`);
    }
  }

  // submit --------------------------------------------------------------
  if (!opts.submit) { log('--no-submit given: the draft is ready in the dashboard, nothing submitted'); return 0; }
  await gotoPage('');
  const submit = await waitFor(() => evaluate(BUTTON('/Prüfen lassen|Submit for review/i')), 'submit button');
  if (submit.disabled) throw new Error('the submit button is disabled — is a review already pending?');
  // the header button only reacts to a DOM click; the dialog's buttons want the mouse
  await evaluate(`Array.from(document.querySelectorAll('button')).filter(function(x){ return /Prüfen lassen|Submit for review/i.test(x.innerText) && x.getBoundingClientRect().width > 0; })[0].click()`);
  const confirm = await waitFor(() => evaluate(BUTTON('/Zur Überprüfung einreichen|Submit for review/i', 150)), 'confirmation dialog', 15000);
  const box = await evaluate(`(function(){
    var c = Array.from(document.querySelectorAll('input[type=checkbox], [role=checkbox]')).filter(function(x){ var r = x.getBoundingClientRect(); return r.width > 0 && r.y > 150; })[0];
    if (!c) return null; var r = c.getBoundingClientRect();
    return { checked: c.checked !== undefined ? c.checked : c.getAttribute('aria-checked') === 'true', cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
  })()`);
  if (box && box.checked !== opts.autoPublish) { await clickAt(box.cx, box.cy); await sleep(500); }
  log(`submitting for review (publish automatically after review: ${box ? (opts.autoPublish ? 'yes' : 'no') : 'no checkbox found'})`);
  await clickAt(confirm.cx, confirm.cy);
  await sleep(5000);
  await gotoPage('/status');
  const status = (/Status:\s*([^\n]+)/.exec(await pageText()) || [])[1];
  log('dashboard status: ' + (status || 'unknown'));
  return /ausstehend|pending/i.test(status || '') ? 0 : 1;
}

main().then(shutdown, async (e) => { console.error('cws-submit: ' + e.message); await shutdown(1); });
