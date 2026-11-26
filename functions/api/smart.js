import { json, fail, readJson, currentUser, effectivePlan, PLAN_LEVEL, cleanText, cleanUrl, getUserSettings, RESERVED } from '../../src/lib.js';

// Links de campanha (Diamante): whitelink.site/nome/promo com contagem de cliques
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const lvl = PLAN_LEVEL[effectivePlan(u).plan];
  const st = await getUserSettings(env, u.id);
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const r = lvl >= 2 ? await env.DB.prepare('SELECT l.*, COALESCE((SELECT SUM(n) FROM camp_clicks c WHERE c.link_id = l.id AND c.day >= ?), 0) AS n30, COALESCE((SELECT SUM(n) FROM camp_clicks c WHERE c.link_id = l.id), 0) AS total FROM camp_links l WHERE user_id = ? ORDER BY id DESC').bind(from, u.id).all() : { results: [] };
  return json({ ok: true, level: lvl, handle: u.handle, links: r.results || [], auto: st.auto || { ab: false, order: false }, live: Object.assign({ viewers: true, sales: true }, st.live || {}) });
}

const SYS = ['midiakit', 'relatorio', 'parceiro'];
export async function onRequestPost({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  if (PLAN_LEVEL[effectivePlan(u).plan] < 2) return fail('Links de campanha são do Diamante.', 403);
  const b = (await readJson(request)) || {};
  const slug = String(b.slug || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]/g, '').slice(0, 40);
  if (slug.length < 2 || SYS.includes(slug) || RESERVED.has(slug)) return fail('Escolha outro nome para o link (2 a 40 letras, números ou -).');
  const url = b.url === 'page' || !b.url ? 'page' : cleanUrl(b.url);
  if (!url) return fail('Link de destino inválido.');
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM camp_links WHERE user_id = ?').bind(u.id).first()).n;
  if (n >= 100) return fail('Limite de 100 links de campanha.');
  try {
    await env.DB.prepare('INSERT INTO camp_links (user_id, slug, name, url, created_at) VALUES (?, ?, ?, ?, ?)').bind(u.id, slug, cleanText(b.name, 60) || slug, url, Date.now()).run();
  } catch (e) { return fail('Você já tem um link com esse nome.'); }
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const id = parseInt(new URL(request.url).searchParams.get('id'), 10) || 0;
  await env.DB.prepare('DELETE FROM camp_links WHERE id = ? AND user_id = ?').bind(id, u.id).run();
  await env.DB.prepare('DELETE FROM camp_clicks WHERE link_id = ?').bind(id).run();
  return json({ ok: true });
}
