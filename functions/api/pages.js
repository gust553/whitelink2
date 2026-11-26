import { json, fail, readJson, currentUser, ensureSchema, cleanHandle, effectivePlan, handleTaken, listPages, maxExtraPages, rateLimit } from '../../src/lib.js';

// Páginas extras (Diamante): listar, criar, apagar
export async function onRequestGet({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  return json({ ok: true, main: u.handle, pages: await listPages(env, u), max: maxExtraPages(u) + 1, can: effectivePlan(u).plan === 'diamante' });
}

export async function onRequestPost({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  if (effectivePlan(u).plan !== 'diamante') return fail('Ter mais de uma página é do Diamante.', 403);
  const b = (await readJson(request)) || {};
  const h = cleanHandle(b.handle);
  if (!h) return fail('Endereço inválido. Use de 3 a 30 letras, números, ponto ou _.');
  const mine = await listPages(env, u);
  const mx = maxExtraPages(u);
  if (mine.length >= mx) return fail('Você já tem as ' + (mx + 1) + ' páginas do seu plano.' + (mx < 19 ? ' No plano Agência são até 20.' : ''));
  if (!(await rateLimit(env, 'page:' + u.id, 10, 3600000))) return fail('Muitas tentativas. Espere um pouco.', 429);
  if (await handleTaken(env, h)) return fail('whitelink.site/' + h + ' já está em uso. Tente outro.');
  const title = String(b.title || '').trim().slice(0, 60) || h;
  const r = await env.DB.prepare("INSERT INTO pages (user_id, handle, title, bio, blocks, appearance, created_at) VALUES (?, ?, ?, '', '[]', '{}', ?)").bind(u.id, h, title, Date.now()).run();
  return json({ ok: true, id: r.meta && r.meta.last_row_id, handle: h });
}

export async function onRequestDelete({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const id = parseInt(new URL(request.url).searchParams.get('id'), 10) || 0;
  await env.DB.prepare('DELETE FROM pages WHERE id = ? AND user_id = ?').bind(id, u.id).run();
  return json({ ok: true });
}
