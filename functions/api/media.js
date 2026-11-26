import { json, fail, readJson, currentUser, effectivePlan, PLAN_LEVEL, randomHex, rateLimit } from '../../src/lib.js';

// Fotos do cliente (perfil, capa, produtos). A foto já chega reduzida pelo celular.
const QUOTA = [6, 60, 400]; // Prata, Ouro, Diamante

export async function onRequestPost({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = await readJson(request, 1200000);
  const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String((b && b.data) || ''));
  if (!m) return fail('Envie uma foto (JPG, PNG ou WEBP).');
  const size = Math.floor(m[3].length * 3 / 4);
  if (size > 800000) return fail('Foto muito grande. Use uma menor que 800 KB.');
  if (!(await rateLimit(env, 'media:' + u.id, 60, 3600000))) return fail('Muitas fotos em pouco tempo. Espere um pouco.', 429);
  const lvl = PLAN_LEVEL[effectivePlan(u).plan];
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM media WHERE user_id = ?').bind(u.id).first()).n;
  if (n >= QUOTA[lvl]) return fail('Você chegou ao limite de ' + QUOTA[lvl] + ' fotos do seu plano. Apague fotos antigas ou mude de plano.');
  const id = randomHex(12);
  await env.DB.prepare('INSERT INTO media (id, user_id, mime, data, size, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, u.id, m[1], m[3], size, Date.now()).run();
  return json({ ok: true, id, url: '/m/' + id });
}

export async function onRequestDelete({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const id = String(new URL(request.url).searchParams.get('id') || '').replace(/[^a-f0-9]/g, '');
  await env.DB.prepare('DELETE FROM media WHERE id = ? AND user_id = ?').bind(id, u.id).run();
  return json({ ok: true });
}
