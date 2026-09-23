// POST /api/ideas/:id/vote — toss one crumb; one per idea per voter
import { json, fail, sameOrigin, readJson, verifyVoter, VOTABLE } from '../../../_shared/pond.js';

const HOUR = 3600000;

export async function onRequestPost({ request, env, params }) {
  if (!sameOrigin(request)) return fail('origin', 403);
  if (!env.DB || !env.VOTER_SECRET) return fail('unconfigured', 503);
  const id = String(params.id || '');
  if (!/^[a-z0-9]{6,12}$/.test(id)) return fail('invalid');
  const body = await readJson(request);
  if (!body) return fail('invalid');
  const voter = await verifyVoter(env, body.voter);
  if (!voter) return fail('voter', 401);

  const idea = await env.DB.prepare('SELECT status, votes FROM ideas WHERE id = ?1').bind(id).first();
  if (!idea || !VOTABLE.includes(idea.status)) return fail('missing', 404);

  const now = Date.now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM votes WHERE voter = ?1 AND created > ?2')
    .bind(voter, now - HOUR).first('n');
  if (recent >= 40) return fail('rate', 429);

  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO votes (idea, voter, created) VALUES (?1, ?2, ?3)')
    .bind(id, voter, now).run();
  if (!inserted.meta.changes) return fail('dup', 409, { votes: idea.votes });

  await env.DB.prepare('UPDATE ideas SET votes = votes + 1 WHERE id = ?1').bind(id).run();
  const votes = await env.DB.prepare('SELECT votes FROM ideas WHERE id = ?1').bind(id).first('votes');
  return json({ ok: true, votes });
}
