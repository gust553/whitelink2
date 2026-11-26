import { json, fail, readJson, currentUser, ensureSchema, rateLimit } from '../../../src/lib.js';
import { getSettings, priceOf, uniqueCents, newOrderCode, orderView } from '../../../src/billing.js';
import { gatewayReady, gatewayCreate } from '../../../src/gateway.js';

// Cria um pedido de Pix com valor exato e código
export async function onRequestPost({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = (await readJson(request)) || {};
  const plan = ['ouro', 'diamante', 'agencia'].includes(b.plan) ? b.plan : null;
  const period = b.period === 'y' ? 'y' : 'm';
  if (!plan) return fail('Escolha o plano.');
  if (!(await rateLimit(env, 'order:' + u.id, 10, 3600000))) return fail('Muitos pedidos em pouco tempo. Tente mais tarde.', 429);
  const s = await getSettings(env);
  const pending = await env.DB.prepare("SELECT id FROM orders WHERE user_id = ? AND status = 'conferir'").bind(u.id).first();
  if (pending) return fail('Você já tem um comprovante em conferência. Espere a liberação ou fale com o suporte.');
  await env.DB.prepare("UPDATE orders SET status = 'cancelado' WHERE user_id = ? AND status IN ('aguardando', 'recusado')").bind(u.id).run();
  const base = priceOf(s, plan, period);
  const now = Date.now();
  const mk = async (gw) => {
    // Pix direto: centavos únicos para achar o pagamento no extrato. Gateway: valor cheio, ele confirma sozinho.
    const cents = gw ? base : await uniqueCents(env, base);
    const code = await newOrderCode(env);
    const ttl = gw ? (parseInt(s.gw_minutes, 10) || 60) * 60000 : (parseInt(s.order_hours, 10) || 24) * 3600000;
    await env.DB.prepare("INSERT INTO orders (code, user_id, plan, period, cents, method, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'aguardando', ?, ?)")
      .bind(code, u.id, plan, period, cents, gw ? 'gateway' : 'pix', now, now + ttl).run();
    return env.DB.prepare('SELECT * FROM orders WHERE code = ?').bind(code).first();
  };
  if (gatewayReady(s)) {
    const o = await mk(true);
    const g = await gatewayCreate(env, s, o, u);
    if (g.ok) {
      const gw = await env.DB.prepare('SELECT pix FROM order_gw WHERE order_id = ?').bind(o.id).first();
      return json({ ok: true, order: orderView(o, s, gw.pix) });
    }
    await env.DB.prepare("UPDATE orders SET status = 'cancelado', note = ? WHERE id = ?").bind('Gateway: ' + String(g.error).slice(0, 150), o.id).run();
    // reserva: se o gateway falhar, o cliente paga por Pix direto (com comprovante)
    if (s.gw_fallback === '0' || !s.pix_key) return fail('Não conseguimos gerar o Pix agora. Tente de novo em alguns minutos.', 502);
  }
  if (!s.pix_key) return fail('Pagamento indisponível no momento. Fale com o suporte.', 503);
  const o = await mk(false);
  return json({ ok: true, order: orderView(o, s) });
}
