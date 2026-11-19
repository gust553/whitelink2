import { json, fail, readJson, currentUser, effectivePlan, PLAN_LIMITS, cleanText, cleanUrl } from '../../../src/lib.js';

export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const r = await env.DB.prepare('SELECT id, title, url, active, clicks FROM links WHERE user_id = ? ORDER BY position, id').bind(u.id).all();
  return json({ ok: true, links: r.results });
}

export async function onRequestPost({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = await readJson(request);
  const title = cleanText(b && b.title, 80);
  const url = cleanUrl(b && b.url);
  if (!title) return fail('Escreva o título do link.');
  if (!url) return fail('Endereço do link inválido.');
  const limit = PLAN_LIMITS[effectivePlan(u).plan];
  const cnt = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(position), 0) AS p FROM links WHERE user_id = ?').bind(u.id).first();
  if (limit && cnt.n >= limit) return fail(`Seu plano permite até ${limit} links. Suba de plano para adicionar mais.`, 403);
  await env.DB.prepare('INSERT INTO links (user_id, title, url, position, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(u.id, title, url, cnt.p + 1, Date.now()).run();
  return json({ ok: true });
}
