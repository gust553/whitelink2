import { json, fail, readJson, currentUser, ensureSchema, cleanText, rateLimit } from '../../../src/lib.js';
import { getSettings, orderView } from '../../../src/billing.js';
import { gatewaySync } from '../../../src/gateway.js';

async function mine(env, request, params) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return [null, null, fail('Entre na sua conta.', 401)];
  const o = await env.DB.prepare('SELECT * FROM orders WHERE code = ? AND user_id = ?').bind(String(params.code || '').toUpperCase(), u.id).first();
  if (!o) return [null, null, fail('Pedido não encontrado.', 404)];
  return [u, o, null];
}

export async function onRequestGet({ request, env, params }) {
  const [, o0, err] = await mine(env, request, params);
  if (err) return err;
  const s = await getSettings(env);
  let o = o0, gwPix = '';
  if (o.method === 'gateway') {
    if (o.status === 'aguardando' && (await gatewaySync(env, s, o))) o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(o.id).first();
    const g = await env.DB.prepare('SELECT pix FROM order_gw WHERE order_id = ?').bind(o.id).first();
    gwPix = g ? g.pix : '';
  }
  return json({ ok: true, order: orderView(o, s, gwPix) });
}

// Envio do comprovante
export async function onRequestPost({ request, env, params }) {
  const [u, o, err] = await mine(env, request, params);
  if (err) return err;
  if (o.method === 'gateway') return fail('Este Pix é confirmado sozinho, não precisa de comprovante.');
  if (!['aguardando', 'recusado'].includes(o.status)) return fail('Este pedido não está esperando comprovante.');
  if (!(await rateLimit(env, 'proof:' + u.id, 8, 3600000))) return fail('Muitos envios. Tente mais tarde.', 429);
  const b = await readJson(request, 1000000);
  if (!b) return fail('Arquivo muito grande. Tire um print menor do comprovante.');
  const img = String(b.image || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(img) || img.length > 900000) return fail('Envie o print do comprovante (imagem).');
  const payer = cleanText(b.payer, 80);
  if (payer.length < 3) return fail('Escreva o nome de quem pagou.');
  if (!b.confirm) return fail('Confirme que o Pix foi feito de verdade.');
  await env.DB.prepare("UPDATE orders SET status = 'conferir', proof = ?, payer = ?, bank = ?, e2e = ?, sent_at = ?, note = NULL WHERE id = ?")
    .bind(img, payer, cleanText(b.bank, 60), cleanText(b.e2e, 40).toUpperCase(), Date.now(), o.id).run();
  return json({ ok: true });
}
