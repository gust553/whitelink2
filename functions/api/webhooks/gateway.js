import { json, ensureSchema } from '../../../src/lib.js';
import { getSettings } from '../../../src/billing.js';
import { gatewaySync } from '../../../src/gateway.js';

// Aviso do Mercado Pago. Não confiamos no aviso: consultamos o pagamento direto no Mercado Pago antes de liberar.
export async function onRequestPost({ request, env }) {
  await ensureSchema(env);
  const url = new URL(request.url);
  let id = url.searchParams.get('data.id') || url.searchParams.get('id') || '';
  try { const b = await request.json(); if (b && b.data && b.data.id) id = String(b.data.id); } catch (e) {}
  id = String(id).replace(/\D/g, '').slice(0, 30);
  if (!id) return json({ ok: true });
  const g = await env.DB.prepare('SELECT order_id FROM order_gw WHERE gw_id = ?').bind(id).first();
  if (!g) return json({ ok: true });
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(g.order_id).first();
  const s = await getSettings(env);
  await gatewaySync(env, s, o);
  return json({ ok: true });
}
