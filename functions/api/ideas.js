// GET  /api/ideas — the public board (open, planned and built ideas)
// POST /api/ideas — submit an idea; it waits in the moderation queue
import {
  json, fail, sameOrigin, readJson, verifyVoter, cleanText, hasLink, publicIdea, PUBLIC_STATUSES,
  translateIdea, storeTranslation
} from '../_shared/pond.js';

const DAY = 86400000;

export async function onRequestGet({ env }) {
  if (!env.DB) return fail('unconfigured', 503);
  const placeholders = PUBLIC_STATUSES.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT id, title, body, lang, status, votes, version, created, tr_title, tr_body FROM ideas
      WHERE status IN (${placeholders}) ORDER BY votes DESC, created DESC LIMIT 300`
  ).bind(...PUBLIC_STATUSES).all();
  // older rows without a translation get one on the way out, a few per request
  if (env.AI) {
    let done = 0;
    for (const row of results) {
      if (row.tr_title || done >= 5) continue;
      const tr = await translateIdea(env, row);
      if (!tr) continue;
      await storeTranslation(env, row.id, tr);
      Object.assign(row, tr);
      done++;
    }
  }
  return json({ ideas: results.map(publicIdea) }, 200, { 'cache-control': 'public, max-age=20' });
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail('origin', 403);
  if (!env.DB || !env.VOTER_SECRET) return fail('unconfigured', 503);
  const body = await readJson(request);
  if (!body) return fail('invalid');
  const voter = await verifyVoter(env, body.voter);
  if (!voter) return fail('voter', 401);

  const title = cleanText(body.title, 80);
  const text = cleanText(body.body, 500);
  const lang = body.lang === 'de' ? 'de' : 'en';
  if (title.length < 4) return fail('title');
  if (hasLink(title) || hasLink(text)) return fail('links');

  const now = Date.now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM ideas WHERE voter = ?1 AND created > ?2')
    .bind(voter, now - DAY).first('n');
  if (recent >= 5) return fail('rate', 429);
  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM ideas WHERE voter = ?1 AND status = 'pending'")
    .bind(voter).first('n');
  if (pending >= 3) return fail('rate', 429);

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const tr = await translateIdea(env, { title, body: text, lang });
  await env.DB.prepare(
    "INSERT INTO ideas (id, title, body, lang, status, votes, created, voter, tr_title, tr_body) VALUES (?1, ?2, ?3, ?4, 'pending', 0, ?5, ?6, ?7, ?8)"
  ).bind(id, title, text, lang, now, voter, tr ? tr.tr_title : null, tr ? tr.tr_body : null).run();
  return json({ ok: true, id }, 201);
}
