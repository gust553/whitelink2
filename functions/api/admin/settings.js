import { json, fail, readJson, requireAdmin, adminLog } from '../../../src/lib.js';
import { getSettings, setSettings } from '../../../src/billing.js';
import { gatewayCheck, PROVIDERS, gwProvider, gwToken } from '../../../src/gateway.js';

// Configurações do negócio: Pix, WhatsApp, forma de pagamento, gateway, preços, indicação e fidelidade
export async function onRequestGet({ request, env }) {
  const [, err] = await requireAdmin(env, request);
  if (err) return err;
  const s = await getSettings(env);
  const out = Object.assign({}, s);
  // chaves dos gateways nunca saem do servidor: só o final, para conferir
  const mask = (t) => (t ? '••••' + t.slice(-6) : '');
  const cur = gwProvider(s);
  out.gw_provider = cur; out.gw_active = cur;
  out.gw_providers = Object.keys(PROVIDERS).map((id) => ({ id, name: PROVIDERS[id].name, doc: PROVIDERS[id].doc, sandbox: !!PROVIDERS[id].sandbox, has: !!gwToken(s, id), token: mask(gwToken(s, id)), account: s['gw_acc_' + id] || (id === 'mercadopago' ? s.gw_account : '') || '' }));
  for (const k of Object.keys(out)) if (k.startsWith('gw_tok_')) delete out[k];
  out.gw_token = mask(gwToken(s, cur));
  out.gw_has = !!gwToken(s, cur);
  out.gw_account = s['gw_acc_' + cur] || (cur === 'mercadopago' ? s.gw_account : '') || '';
  out.gw_test = /^TEST-|_hmlg_|^sk_test_/.test(gwToken(s, cur)) || (cur === 'pagbank' && s.gw_sandbox === '1');
  delete out.schema_v;
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
  if (b.gw_provider !== undefined) { if (!PROVIDERS[b.gw_provider]) return fail('Gateway desconhecido.'); patch.gw_provider = b.gw_provider; }
  if (b.gw_sandbox !== undefined) patch.gw_sandbox = b.gw_sandbox === '1' || b.gw_sandbox === true ? '1' : '0';
  let newTok;
  if (b.gw_token !== undefined && !String(b.gw_token).startsWith('••••')) newTok = String(b.gw_token).replace(/\s+/g, '').slice(0, 300);
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
  const prov = patch.gw_provider || gwProvider(cur);
  const PN = PROVIDERS[prov].name;
  if (newTok !== undefined) { patch['gw_tok_' + prov] = newTok; if (prov === 'mercadopago') patch.gw_token = newTok; }
  if (b.gw_remove !== undefined) {
    if (!PROVIDERS[b.gw_remove]) return fail('Gateway desconhecido.');
    patch['gw_tok_' + b.gw_remove] = ''; patch['gw_acc_' + b.gw_remove] = '';
    if (b.gw_remove === 'mercadopago') { patch.gw_token = ''; patch.gw_account = ''; }
  }
  const next = Object.assign({}, cur, patch);
  if (next.pay_mode === 'gateway' && !gwToken(next, prov)) return fail(b.gw_remove ? 'Este gateway está em uso. Escolha Pix direto ou outro gateway antes de remover a chave.' : 'Para usar o ' + PN + ', cole primeiro a chave dele.');
  if (next.pay_mode === 'pix' && !next.pix_key) return fail('Para receber por Pix direto, cadastre a chave Pix.');
  if (next.pay_mode === 'gateway' && next.gw_fallback !== '0' && !next.pix_key) return fail('A reserva por Pix direto está ligada: cadastre a chave Pix ou desligue a reserva.');
  let warn = '';
  const recheck = newTok || (patch.gw_sandbox !== undefined && patch.gw_sandbox !== cur.gw_sandbox && prov === 'pagbank' && gwToken(next, prov));
  if (recheck) {
    const c = await gatewayCheck(prov, gwToken(next, prov), next.gw_sandbox === '1');
    if (!c.ok && !c.offline) return fail(c.error);
    patch['gw_acc_' + prov] = c.ok ? c.account : ''; patch.gw_checked = c.ok ? String(Date.now()) : '';
    if (prov === 'mercadopago') patch.gw_account = patch.gw_acc_mercadopago;
    if (!c.ok) warn = 'Chave salva, mas não deu para conferir agora: ' + c.error;
  } else if (newTok === '') { patch['gw_acc_' + prov] = ''; if (prov === 'mercadopago') patch.gw_account = ''; }
  await setSettings(env, patch);
  await adminLog(env, admin.id, 'configurações: ' + Object.keys(patch).filter((k) => !/^gw_tok|^gw_token$|^cf_token$|^gw_acc/.test(k)).join(', ') + (newTok !== undefined ? ', chave do ' + PN : '') + (b.gw_remove ? ', removeu chave do ' + PROVIDERS[b.gw_remove].name : '') + (patch.cf_token !== undefined ? ', token da Cloudflare' : ''), '');
  return json({ ok: true, warn });
}

// Botão "Testar conexão": confere o token salvo no Mercado Pago
export async function onRequestPost({ request, env }) {
  const [admin, err] = await requireAdmin(env, request);
  if (err) return err;
  const s = await getSettings(env);
  const b = (await readJson(request)) || {};
  const prov = PROVIDERS[b.provider] ? b.provider : gwProvider(s);
  if (!gwToken(s, prov)) return fail('Cole a chave e salve antes de testar.');
  const c = await gatewayCheck(prov, gwToken(s, prov), s.gw_sandbox === '1');
  if (c.ok) await setSettings(env, Object.assign({ ['gw_acc_' + prov]: c.account, gw_checked: String(Date.now()) }, prov === 'mercadopago' ? { gw_account: c.account } : {}));
  await adminLog(env, admin.id, 'testou o gateway: ' + (c.ok ? 'ok' : 'falhou'), '');
  return c.ok ? json({ ok: true, account: c.account }) : fail(c.error);
}
