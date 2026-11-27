// Meta (Facebook/Instagram Ads): API de Conversões, enviada pelo servidor.
// Liga sozinho quando as variáveis META_PIXEL_ID (4293861087575730) e META_CAPI_TOKEN existem na Cloudflare.
// Os eventos do servidor usam o mesmo event_id do pixel do navegador, então a Meta não conta em dobro.
import { sha256, clientIp, getCookie } from './lib.js';

const GRAPH = 'https://graph.facebook.com/v21.0/';

async function ensureTable(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS ad_attrib (user_id INTEGER PRIMARY KEY, fbp TEXT, fbc TEXT, ip TEXT, ua TEXT, created_at INTEGER NOT NULL)'
  ).run();
}

// guarda de onde a pessoa veio (cookies do pixel), para ligar o pagamento ao anúncio depois
export async function saveAttrib(env, userId, request) {
  try {
    await ensureTable(env);
    const fbp = getCookie(request, '_fbp') || null;
    const fbc = getCookie(request, '_fbc') || null;
    await env.DB.prepare('INSERT OR REPLACE INTO ad_attrib (user_id, fbp, fbc, ip, ua, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(userId, fbp, fbc, clientIp(request), (request.headers.get('user-agent') || '').slice(0, 400), Date.now()).run();
  } catch (e) { /* não atrapalha o cadastro */ }
}

async function userData(u, a) {
  const d = {};
  if (u) {
    if (u.email) d.em = [await sha256(String(u.email).trim().toLowerCase())];
    if (u.phone) d.ph = [await sha256(String(u.phone).replace(/\D/g, ''))];
    d.external_id = [await sha256('wl-' + u.id)];
  }
  if (a) {
    if (a.fbp) d.fbp = a.fbp;
    if (a.fbc) d.fbc = a.fbc;
    if (a.ip && a.ip !== '0.0.0.0') d.client_ip_address = a.ip;
    if (a.ua) d.client_user_agent = a.ua;
  }
  return d;
}

async function send(env, events) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) return;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const body = { data: events };
    if (env.META_TEST_CODE) body.test_event_code = env.META_TEST_CODE;
    await fetch(GRAPH + env.META_PIXEL_ID + '/events?access_token=' + encodeURIComponent(env.META_CAPI_TOKEN), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal
    });
  } catch (e) { /* falha de rede não pode quebrar o site */ }
  clearTimeout(t);
}

// cadastro concluído (e início do teste Diamante, se ganhou)
export async function trackSignup(env, request, userId, trial) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) return;
  const u = await env.DB.prepare('SELECT id, email, phone FROM users WHERE id = ?').bind(userId).first();
  const a = {
    fbp: getCookie(request, '_fbp'), fbc: getCookie(request, '_fbc'),
    ip: clientIp(request), ua: request.headers.get('user-agent') || ''
  };
  const ud = await userData(u, a);
  const now = Math.floor(Date.now() / 1000);
  const src = 'https://whitelink.site/entrar';
  const ev = [{ event_name: 'CompleteRegistration', event_time: now, event_id: 'reg-' + userId, action_source: 'website',
    event_source_url: src, user_data: ud, custom_data: { content_name: trial ? 'teste_diamante' : 'prata', status: 'ok' } }];
  if (trial) ev.push({ event_name: 'StartTrial', event_time: now, event_id: 'reg-' + userId + '-t', action_source: 'website',
    event_source_url: src, user_data: ud, custom_data: { value: 0, currency: 'BRL', predicted_ltv: 39.9 } });
  await send(env, ev);
}

// pagamento aprovado (Pix direto liberado no admin ou gateway): é a venda de verdade
export async function trackPurchase(env, o) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) return;
  try {
    const u = await env.DB.prepare('SELECT id, email, phone FROM users WHERE id = ?').bind(o.user_id).first();
    let a = null;
    try { a = await env.DB.prepare('SELECT * FROM ad_attrib WHERE user_id = ?').bind(o.user_id).first(); } catch (e) { a = null; }
    const first = (await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status = 'liberado' AND id <> ?").bind(o.user_id, o.id).first()).n === 0;
    await send(env, [{
      event_name: 'Purchase', event_time: Math.floor(Date.now() / 1000), event_id: 'order-' + o.id, action_source: 'website',
      event_source_url: 'https://whitelink.site/pagamento', user_data: await userData(u, a),
      custom_data: { value: Math.round(o.cents) / 100, currency: 'BRL', content_name: o.plan + (o.period === 'y' ? '_anual' : '_mensal'),
        content_type: 'product', content_ids: [o.plan], order_id: String(o.id), customer_type: first ? 'new' : 'returning' }
    }]);
  } catch (e) { /* não atrapalha a liberação */ }
}
