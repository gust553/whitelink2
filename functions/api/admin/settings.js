import { json, fail, readJson, requireAdmin, adminLog } from '../../../src/lib.js';
import { getSettings, setSettings } from '../../../src/billing.js';
import { gatewayCheck } from '../../../src/gateway.js';

// Configurações do negócio: Pix, WhatsApp, forma de pagamento, gateway, preços, indicação e fidelidade
export async function onRequestGet({ request, env }) {
  const [, err] = await requireAdmin(env, request);
  if (err) return err;
  const s = await getSettings(env);
  const out = Object.assign({}, s);
  out.gw_token = s.gw_token ? '••••' + s.gw_token.slice(-6) : '';
  out.gw_has = !!s.gw_token;
  out.gw_test = /^TEST-/.test(s.gw_token || '');
  delete out.vapid_priv;
  out.cf_token = s.cf_token ? '••••' + s.cf_token.slice(-4) : '';
  const d = await env.DB.prepare('SELECT d.hostname, d.status, d.created_at, u.name, u.handle FROM domains d JOIN users u ON u.id = d.user_id ORDER BY d.created_at DESC LIMIT 200').all();
  return json({ ok: true, settings: out, domains: d.results || [] });
}

export async function onRequestPut({ request, env }) {
  const [admin, err] = await requireAdmin(env, request);
  if (err) return err;
  const b = (await readJson(request)) || {};
  const patch = {};
  const txt = (k, max) => { if (b[k] !== undefined) patch[k] = String(b[k]).trim().slice(0, max); };
  txt('pix_key', 77); txt('pix_name', 25); txt('pix_city', 15);
  if (b.pix_name !== undefined) patch.pix_name = patch.pix_name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (b.pix_city !== undefined) patch.pix_city = patch.pix_city.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (b.whatsapp !== undefined) { let w = String(b.whatsapp).replace(/\D/g, ''); if (w.length <= 11) w = '55' + w; patch.whatsapp = w; }
  if (b.ann_on !== undefined) patch.ann_on = b.ann_on === '0' || b.ann_on === false ? '0' : '1';
  txt('ann_title', 80); txt('ann_text', 400);
  if (b.pay_mode !== undefined) patch.pay_mode = b.pay_mode === 'gateway' ? 'gateway' : 'pix';
  if (b.gw_provider !== undefined) patch.gw_provider = 'mercadopago';
  if (b.gw_token !== undefined && !String(b.gw_token).startsWith('••••')) patch.gw_token = String(b.gw_token).replace(/\s+/g, '').slice(0, 300);
  if (b.gw_fallback !== undefined) patch.gw_fallback = b.gw_fallback === '0' || b.gw_fallback === false ? '0' : '1';
  if (b.gw_minutes !== undefined) { const n = parseInt(b.gw_minutes, 10); if (!(n >= 10 && n <= 1440)) return fail('Tempo para pagar: de 10 a 1440 minutos.'); patch.gw_minutes = String(n); }
  if (b.cf_token !== undefined && !String(b.cf_token).startsWith('••••')) patch.cf_token = String(b.cf_token).trim().slice(0, 200);
  if (b.cf_zone !== undefined) { const z = String(b.cf_zone).trim().toLowerCase(); if (z && !/^[a-f0-9]{32}$/.test(z)) return fail('O ID da zona tem 32 letras e números. Confira se copiou certo.'); patch.cf_zone = z; }
  for (const k of ['price_ouro_m', 'price_ouro_y', 'price_diamante_m', 'price_diamante_y', 'price_agencia_m', 'price_agencia_y']) {
    if (b[k] !== undefined) { const c = Math.round(parseFloat(String(b[k]).replace(/\./g, '').replace(',', '.')) * 100); if (!(c >= 100 && c <= 10000000)) return fail('Preço inválido.'); patch[k] = String(c); }
  }
  for (const k of ['order_hours', 'ref_bonus_days', 'loyalty_every', 'loyalty_days']) {
    if (b[k] !== undefined) { const n = parseInt(b[k], 10); if (!(n >= 0 && n <= 999)) return fail('Número inválido.'); patch[k] = String(n); }
  }
  if (patch.pix_key && patch.pix_key.length < 8) return fail('Chave Pix inválida.');
  const cur = await getSettings(env);
  const next = Object.assign({}, cur, patch);
  if (next.pay_mode === 'gateway' && !next.gw_token) return fail('Para usar o gateway, cole primeiro o Access Token do Mercado Pago.');
  if (next.pay_mode === 'pix' && !next.pix_key) return fail('Para receber por Pix direto, cadastre a chave Pix.');
  if (next.pay_mode === 'gateway' && next.gw_fallback !== '0' && !next.pix_key) return fail('A reserva por Pix direto está ligada: cadastre a chave Pix ou desligue a reserva.');
  let warn = '';
  if (patch.gw_token) {
    const c = await gatewayCheck(patch.gw_token);
    if (!c.ok && !c.offline) return fail(c.error);
    patch.gw_account = c.ok ? c.account : ''; patch.gw_checked = c.ok ? String(Date.now()) : '';
    if (!c.ok) warn = 'Token salvo, mas não deu para conferir agora: ' + c.error;
  } else if (patch.gw_token === '') { patch.gw_account = ''; patch.gw_checked = ''; }
  await setSettings(env, patch);
  await adminLog(env, admin.id, 'configurações: ' + Object.keys(patch).filter((k) => k !== 'gw_token' && k !== 'cf_token').join(', ') + (patch.gw_token !== undefined ? ', token do gateway' : '') + (patch.cf_token !== undefined ? ', token da Cloudflare' : ''), '');
  return json({ ok: true, warn });
}

// Botão "Testar conexão": confere o token salvo no Mercado Pago
export async function onRequestPost({ request, env }) {
  const [admin, err] = await requireAdmin(env, request);
  if (err) return err;
  const s = await getSettings(env);
  if (!s.gw_token) return fail('Cole o Access Token e salve antes de testar.');
  const c = await gatewayCheck(s.gw_token);
  if (c.ok) await setSettings(env, { gw_account: c.account, gw_checked: String(Date.now()) });
  await adminLog(env, admin.id, 'testou o gateway: ' + (c.ok ? 'ok' : 'falhou'), '');
  return c.ok ? json({ ok: true, account: c.account }) : fail(c.error);
}
