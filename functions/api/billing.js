import { json, fail, currentUser, publicUser, ensureSchema } from '../../src/lib.js';
import { getSettings, orderView, priceOf, brl, settleRewards } from '../../src/billing.js';

// Meu plano: plano atual, pedido aberto, histórico e preços
export async function onRequestGet({ request, env }) {
  await ensureSchema(env);
  let u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  await settleRewards(env, u.id);
  u = await currentUser(env, request);
  const s = await getSettings(env);
  const now = Date.now();
  await env.DB.prepare("UPDATE orders SET status = 'vencido' WHERE user_id = ? AND status = 'aguardando' AND expires_at < ?").bind(u.id, now).run();
  const open = await env.DB.prepare("SELECT * FROM orders WHERE user_id = ? AND status IN ('aguardando', 'conferir', 'recusado') ORDER BY id DESC LIMIT 1").bind(u.id).first();
  const hist = await env.DB.prepare("SELECT * FROM orders WHERE user_id = ? AND status = 'liberado' ORDER BY id DESC LIMIT 24").bind(u.id).all();
  const paid = (hist.results || []).length;
  const prices = {};
  for (const p of ['ouro', 'diamante']) for (const per of ['m', 'y']) prices[p + '_' + per] = { cents: priceOf(s, p, per), label: brl(priceOf(s, p, per)) };
  return json({
    ok: true, user: publicUser(u), prices,
    open: open ? orderView(open, s, open.method === 'gateway' ? ((await env.DB.prepare('SELECT pix FROM order_gw WHERE order_id = ?').bind(open.id).first()) || {}).pix : '') : null,
    history: (hist.results || []).map((o) => orderView(o, s)),
    loyalty: { every: +s.loyalty_every, days: +s.loyalty_days, count: Math.max(0, paid - 1) % (+s.loyalty_every || 3) },
    whatsapp: s.whatsapp, payMode: s.pay_mode
  });
}
