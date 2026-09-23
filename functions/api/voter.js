// POST /api/voter — trade a passed Turnstile check for a signed voter token.
import { json, fail, sameOrigin, readJson, verifyTurnstile, issueVoter } from '../_shared/pond.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail('origin', 403);
  if (!env.TURNSTILE_SECRET || !env.VOTER_SECRET) return fail('unconfigured', 503);
  const body = await readJson(request);
  if (!body) return fail('invalid');
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (!(await verifyTurnstile(env, body.turnstile, ip))) return fail('turnstile', 403);
  return json({ voter: await issueVoter(env) });
}
