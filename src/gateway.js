// Gateway de pagamento (Mercado Pago, Pix automático). Ligado pelo admin em Configurações.
// O plano libera sozinho quando o Mercado Pago confirma o Pix.
import { releaseOrder } from './billing.js';

const MP = 'https://api.mercadopago.com/v1/payments';

export function gatewayReady(s) {
  return s.pay_mode === 'gateway' && s.gw_provider === 'mercadopago' && String(s.gw_token || '').length > 20;
}

export async function gatewayCreate(env, s, o, u) {
  try { return await create(env, s, o, u); } catch (e) { return { ok: false, error: 'Sem conexão com o gateway.' }; }
}
async function create(env, s, o, u) {
  const r = await fetch(MP, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + s.gw_token, 'content-type': 'application/json', 'x-idempotency-key': o.code },
    body: JSON.stringify({
      transaction_amount: o.cents / 100,
      description: 'WhiteLink ' + (o.plan === 'ouro' ? 'Ouro' : 'Diamante') + (o.period === 'y' ? ' anual' : ' mensal'),
      payment_method_id: 'pix',
      external_reference: o.code,
      notification_url: 'https://whitelink.site/api/webhooks/gateway',
      date_of_expiration: new Date(o.expires_at).toISOString().replace('Z', '-00:00'),
      payer: { email: u.email, first_name: String(u.name).split(' ')[0] }
    })
  });
  const d = await r.json().catch(() => ({}));
  const t = d && d.point_of_interaction && d.point_of_interaction.transaction_data;
  if (!r.ok || !t || !t.qr_code) return { ok: false, error: (d && d.message) || 'O gateway não respondeu.' };
  await env.DB.prepare('INSERT OR REPLACE INTO order_gw (order_id, gw_id, pix, created_at) VALUES (?, ?, ?, ?)').bind(o.id, String(d.id), t.qr_code, Date.now()).run();
  return { ok: true };
}

// Consulta o pagamento no gateway e libera o plano se estiver aprovado
export async function gatewaySync(env, s, o) {
  try { return await sync(env, s, o); } catch (e) { return false; }
}
async function sync(env, s, o) {
  if (o.method !== 'gateway' || o.status !== 'aguardando') return false;
  const g = await env.DB.prepare('SELECT * FROM order_gw WHERE order_id = ?').bind(o.id).first();
  if (!g || !s.gw_token) return false;
  const r = await fetch(MP + '/' + encodeURIComponent(g.gw_id), { headers: { authorization: 'Bearer ' + s.gw_token } });
  if (!r.ok) return false;
  const d = await r.json();
  if (d.status === 'approved' && d.external_reference === o.code && Math.round(Number(d.transaction_amount) * 100) === o.cents) {
    const fresh = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(o.id).first();
    if (fresh.status !== 'aguardando') return false;
    await env.DB.prepare('UPDATE orders SET e2e = ?, payer = ? WHERE id = ?').bind('MP-' + g.gw_id, (d.payer && (d.payer.first_name || d.payer.email)) || '', o.id).run();
    await releaseOrder(env, fresh);
    return true;
  }
  if (['cancelled', 'rejected', 'expired'].includes(d.status)) await env.DB.prepare("UPDATE orders SET status = 'vencido' WHERE id = ?").bind(o.id).run();
  return false;
}
