// Cursor Duck website — (c) 2026 Lucas Reiser (forliHD). All rights reserved. See LICENSE.
//
// Shared helpers for the wishing-pond API (Cloudflare Pages Functions + D1).
// Bindings expected in the environment: DB (D1), TURNSTILE_SECRET, VOTER_SECRET,
// ADMIN_TOKEN. Nothing here stores IP addresses or anything personal: a voter is
// a random id that the server signs once the Turnstile check has passed.

const enc = new TextEncoder();

export const STATUSES = ['pending', 'open', 'planned', 'built', 'declined'];
export const PUBLIC_STATUSES = ['open', 'planned', 'built'];
export const VOTABLE = ['open', 'planned'];

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

export function fail(code, status = 400, extra = {}) {
  return json({ error: code, ...extra }, status);
}

// Browsers send an Origin header on POST; anything cross-site is refused.
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

export async function readJson(request, max = 8192) {
  const text = await request.text();
  if (text.length > max) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(message))).slice(0, 27);
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// A voter token is "<random id>.<hmac>": unforgeable without VOTER_SECRET, and
// the database only ever sees the id part.
export async function issueVoter(env) {
  const id = b64url(crypto.getRandomValues(new Uint8Array(12)));
  return id + '.' + await hmac(env.VOTER_SECRET, id);
}

export async function verifyVoter(env, token) {
  if (typeof token !== 'string' || token.length > 80) return null;
  const dot = token.indexOf('.');
  if (dot < 8) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  return timingSafeEqual(sig, await hmac(env.VOTER_SECRET, id)) ? id : null;
}

export async function verifyTurnstile(env, token, ip) {
  if (typeof token !== 'string' || !token || token.length > 4096) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const out = await res.json();
    return out.success === true;
  } catch {
    return false;
  }
}

export function isAdmin(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return !!env.ADMIN_TOKEN && token.length > 0 && timingSafeEqual(token, env.ADMIN_TOKEN);
}

export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

// Links are the currency of spam; ideas for a duck don't need them.
export function hasLink(text) {
  return /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|de|xyz|ru|cn|info|biz|co|app|dev|shop|online|site)\b/i.test(text);
}

export function publicIdea(row) {
  return {
    id: row.id, title: row.title, body: row.body, lang: row.lang,
    status: row.status, votes: row.votes, version: row.version || null, created: row.created,
    tr_title: row.tr_title || null, tr_body: row.tr_body || null
  };
}

// Ideas are shown in the visitor's language: the other language is filled in
// by Workers AI (binding AI) once per idea. Title and body go into one call so
// the model has context for the short headline; an instruction-tuned model
// beats the plain translation models on tone ("she", "du"). No binding or a
// failed call simply leaves the original, which the site shows as is.
const LANG_NAME = { en: 'English', de: 'German' };
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

function parseTranslation(out) {
  let raw = out && out.response !== undefined ? out.response : out;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const attempts = [raw.trim(), raw.replace(/```[a-z]*/gi, '').trim()];
  const braces = raw.match(/\{[\s\S]*?\}/);
  if (braces) attempts.push(braces[0]);
  for (const candidate of attempts) {
    try { return JSON.parse(candidate); } catch { /* next */ }
  }
  return null;
}

async function ask(env, system, user, maxTokens) {
  return env.AI.run(MODEL, {
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: maxTokens,
    temperature: 0.1
  });
}

export async function translateIdea(env, idea) {
  if (!env.AI || !idea.title) return null;
  const from = idea.lang === 'de' ? 'de' : 'en';
  const to = from === 'de' ? 'en' : 'de';
  const tone = 'Keep the meaning, the casual tone and the length. Address the reader informally (German: du). ' +
    'The duck is female (German: sie, die Ente).';
  const intro = 'You translate feature ideas for Cursor Duck, a browser extension in which a little duck ' +
    'follows the mouse pointer. Translate from ' + LANG_NAME[from] + ' to ' + LANG_NAME[to] + '. ' + tone;
  try {
    // one call for both fields: the body gives the short headline its context
    const out = await ask(env, intro + ' The title is a short headline: translate it as one and never expand it. ' +
      'Reply with JSON only, in the shape {"title": "...", "body": "..."}; keep the body empty if it is empty.',
      JSON.stringify({ title: idea.title, body: idea.body || '' }), 600);
    const parsed = parseTranslation(out);
    if (parsed && typeof parsed.title === 'string') {
      const title = cleanText(parsed.title, 120);
      if (title) return { tr_title: title, tr_body: cleanText(typeof parsed.body === 'string' ? parsed.body : '', 800) };
    }
    // the model did not play along with JSON: plain text, one field per call
    const plain = intro + ' Reply with the translation only: no quotes, notes or explanations.';
    const titleOut = await ask(env, plain + ' The text is a short headline; keep it one.', idea.title, 120);
    const title = cleanText(typeof titleOut.response === 'string' ? titleOut.response.replace(/^["\u201C\u201E']+|["\u201D\u201C']+$/g, '') : '', 120);
    if (!title) return null;
    let body = '';
    if (idea.body) {
      const bodyOut = await ask(env, plain, idea.body, 500);
      body = cleanText(typeof bodyOut.response === 'string' ? bodyOut.response.replace(/^["\u201C\u201E']+|["\u201D\u201C']+$/g, '') : '', 800);
    }
    return { tr_title: title, tr_body: body };
  } catch (err) {
    console.error('translateIdea failed', err && err.message ? err.message : err);
    return null;
  }
}

export async function storeTranslation(env, id, tr) {
  await env.DB.prepare('UPDATE ideas SET tr_title = ?2, tr_body = ?3 WHERE id = ?1')
    .bind(id, tr.tr_title, tr.tr_body).run();
}
