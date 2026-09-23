// POST   /api/admin/ideas/:id — set status/version, optionally fix title/body
//                                or refresh the translation ({ translate: true })
// DELETE /api/admin/ideas/:id — remove an idea and its votes
import {
  json, fail, isAdmin, readJson, cleanText, STATUSES, translateIdea, storeTranslation
} from '../../../_shared/pond.js';

export async function onRequestPost({ request, env, params }) {
  if (!isAdmin(request, env)) return fail('auth', 401);
  if (!env.DB) return fail('unconfigured', 503);
  const id = String(params.id || '');
  const body = await readJson(request);
  if (!body || !STATUSES.includes(body.status)) return fail('invalid');
  const version = body.status === 'built' && typeof body.version === 'string' && /^\d+\.\d+(\.\d+)?$/.test(body.version)
    ? body.version : null;
  const title = typeof body.title === 'string' ? cleanText(body.title, 80) : null;
  const text = typeof body.body === 'string' ? cleanText(body.body, 500) : null;
  if (title !== null && title.length < 4) return fail('title');
  const result = await env.DB.prepare(
    'UPDATE ideas SET status = ?2, version = ?3, title = COALESCE(?4, title), body = COALESCE(?5, body) WHERE id = ?1'
  ).bind(id, body.status, version, title, text).run();
  if (!result.meta.changes) return fail('missing', 404);
  let translated = false;
  if (body.translate === true || title !== null || text !== null) {
    const row = await env.DB.prepare('SELECT id, title, body, lang FROM ideas WHERE id = ?1').bind(id).first();
    const tr = row ? await translateIdea(env, row) : null;
    if (tr) { await storeTranslation(env, id, tr); translated = true; }
  }
  return json({ ok: true, translated });
}

export async function onRequestDelete({ request, env, params }) {
  if (!isAdmin(request, env)) return fail('auth', 401);
  if (!env.DB) return fail('unconfigured', 503);
  const id = String(params.id || '');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM votes WHERE idea = ?1').bind(id),
    env.DB.prepare('DELETE FROM ideas WHERE id = ?1').bind(id)
  ]);
  return json({ ok: true });
}
