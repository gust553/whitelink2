import { json, ensureSchema } from '../../../src/lib.js';
import { getSettings } from '../../../src/billing.js';
import { gatewaySync } from '../../../src/gateway.js';

// Aviso dos gateways (Mercado Pago, Asaas, PagBank, Pagar.me).
// Não confiamos no aviso: só usamos o número do pagamento e consultamos direto no gateway antes de liberar.
export async function onRequestPost({ request, env }) {
  await ensureSchema(env);
  const url = new URL(request.url);
  const ids = [url.searchParams.get('data.id'), url.searchParams.get('id')];
  try {
    const b = await request.json();
    if (b) ids.push(b.data && b.data.id, b.payment && b.payment.id, b.id, b.order && b.order.id, b.data && b.data.order && b.data.order.id);
  } catch (e) {}
  const s = await getSettings(env);
  for (const raw of ids) {
    const id = String(raw || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
    if (!id) continue;
    const g = await env.DB.prepare('SELECT order_id FROM order_gw WHERE gw_id = ?').bind(id).first();
    if (!g) continue;
    const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(g.order_id).first();
    await gatewaySync(env, s, o);
    break;
  }
  return json({ ok: true });
}
