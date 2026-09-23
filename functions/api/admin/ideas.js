// GET /api/admin/ideas?status=pending — moderation list (Bearer ADMIN_TOKEN)
import { json, fail, isAdmin, publicIdea, STATUSES } from '../../_shared/pond.js';

export async function onRequestGet({ request, env }) {
  if (!isAdmin(request, env)) return fail('auth', 401);
  if (!env.DB) return fail('unconfigured', 503);
  const status = new URL(request.url).searchParams.get('status') || 'pending';
  if (!STATUSES.includes(status)) return fail('invalid');
  const { results } = await env.DB.prepare(
    'SELECT id, title, body, lang, status, votes, version, created FROM ideas WHERE status = ?1 ORDER BY created DESC LIMIT 500'
  ).bind(status).all();
  const counts = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM ideas GROUP BY status').all();
  const byStatus = {};
  for (const row of counts.results) byStatus[row.status] = row.n;
  return json({ ideas: results.map(publicIdea), counts: byStatus });
}
