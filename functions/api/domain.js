import { json, fail, readJson, currentUser, effectivePlan, rateLimit } from '../../src/lib.js';
import { cleanHostname, domainGet, domainAdd, domainRemove, cfReady, TARGET } from '../../src/domains.js';

// Domínio próprio do cliente (Diamante)
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  return json({ ok: true, enabled: !!(await cfReady(env)), target: TARGET, can: effectivePlan(u).plan === 'diamante', domain: await domainGet(env, u.id, true) });
}

export async function onRequestPost({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  if (effectivePlan(u).plan !== 'diamante') return fail('Domínio próprio é do Diamante.', 403);
  if (!(await rateLimit(env, 'dom:' + u.id, 6, 3600000))) return fail('Muitas tentativas. Espere um pouco.', 429);
  const b = (await readJson(request)) || {};
  const h = cleanHostname(b.hostname);
  if (!h) return fail('Domínio inválido. Ex.: links.seusite.com.br');
  const r = await domainAdd(env, u.id, h);
  return r.ok ? json(r) : fail(r.error);
}

export async function onRequestDelete({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  await domainRemove(env, u.id);
  return json({ ok: true });
}
