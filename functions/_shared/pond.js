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
// by Workers AI (binding AI) once per idea. An instruction-tuned model beats the
// plain translation models on tone ("she", "du"); no binding or a failed call
// simply leaves the original, which the site shows as is.
const LANG_NAME = { en: 'English', de: 'German' };
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export async function translateText(env, text, from, to) {
  if (!env.AI || !text) return null;
  const system = 'You translate short feature ideas for Cursor Duck, a browser extension in which a little ' +
    'duck follows the mouse pointer. Translate the user\'s text from ' + LANG_NAME[from] + ' to ' + LANG_NAME[to] +
    '. Keep the meaning, the casual tone and the length. Address the reader informally (German: du). ' +
    'The duck is female (German: sie, die Ente). Reply with the translation only: no quotes, notes or explanations.';
  const out = await env.AI.run(MODEL, {
    messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
    max_tokens: 400,
    temperature: 0.2
  });
  let translated = out && typeof out.response === 'string' ? out.response.trim() : '';
  translated = translated.replace(/^["\u201C\u201E']+|["\u201D\u201C']+$/g, '').trim();
  return translated || null;
}

export async function translateIdea(env, idea) {
  const from = idea.lang === 'de' ? 'de' : 'en';
  const to = from === 'de' ? 'en' : 'de';
  try {
    const title = await translateText(env, idea.title, from, to);
    if (!title) return null;
    const body = idea.body ? await translateText(env, idea.body, from, to) : '';
    return { tr_title: cleanText(title, 120), tr_body: cleanText(body || '', 800) };
  } catch {
    return null;
  }
}

export async function storeTranslation(env, id, tr) {
  await env.DB.prepare('UPDATE ideas SET tr_title = ?2, tr_body = ?3 WHERE id = ?1')
    .bind(id, tr.tr_title, tr.tr_body).run();
}
