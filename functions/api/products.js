import { json, fail, readJson, currentUser, effectivePlan, PLAN_LEVEL, cleanText } from '../../src/lib.js';
import { PRODUCT_LIMIT } from '../../src/biz.js';

// Produtos da loja do criador
export async function onRequestPost({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const lvl = PLAN_LEVEL[effectivePlan(u).plan];
  const b = (await readJson(request)) || {};
  const c = Math.round(parseFloat(String(b.price || '0').replace(/\./g, '').replace(',', '.')) * 100);
  if (!(c > 0 && c <= 10000000)) return fail('Coloque o preço. Ex.: 59,90');
  const name = cleanText(b.name, 80);
  if (!name) return fail('Coloque o nome do produto.');
  const img = /^[a-f0-9]{24}$/.test(b.image || '') ? b.image : null;
  const stock = b.stock === '' || b.stock == null ? -1 : Math.max(0, Math.min(100000, parseInt(b.stock, 10) || 0));
  if (b.id) {
    await env.DB.prepare('UPDATE products SET name = ?, cents = ?, image = ?, descr = ?, active = ?, stock = ? WHERE id = ? AND user_id = ?')
      .bind(name, c, img, cleanText(b.descr, 300), b.active === false ? 0 : 1, stock, parseInt(b.id, 10) || 0, u.id).run();
    return json({ ok: true });
  }
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM products WHERE user_id = ?').bind(u.id).first()).n;
  if (lvl < 1) return fail('A loja é do plano Ouro ou Diamante.', 403);
  if (n >= PRODUCT_LIMIT[lvl]) return fail('Seu plano permite até ' + PRODUCT_LIMIT[lvl] + ' produtos. No Diamante é ilimitado.');
  const r = await env.DB.prepare('INSERT INTO products (user_id, name, cents, image, descr, active, stock, position, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)')
    .bind(u.id, name, c, img, cleanText(b.descr, 300), stock, n, Date.now()).run();
  return json({ ok: true, id: r.meta && r.meta.last_row_id });
}

export async function onRequestDelete({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const id = parseInt(new URL(request.url).searchParams.get('id'), 10) || 0;
  await env.DB.prepare('DELETE FROM products WHERE id = ? AND user_id = ?').bind(id, u.id).run();
  return json({ ok: true });
}
