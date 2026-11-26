// Pagamentos do WhiteLink: preços, configurações do admin, Pix copia e cola
import { ensureSchema, randomHex } from './lib.js';

export const DEFAULTS = {
  pix_key: 'fcaf9712-5ed5-47c7-bf1a-dbcaa9614ab6',
  pix_name: 'GM DIGITAL',
  pix_city: 'SAO PAULO',
  whatsapp: '5511993931841',
  order_hours: '24',
  pay_mode: 'pix',
  price_ouro_m: '1990', price_ouro_y: '19990', price_diamante_m: '3990', price_diamante_y: '39990', price_agencia_m: '9990', price_agencia_y: '99990',
  ref_bonus_days: '7', loyalty_every: '3', loyalty_days: '7',
  gw_provider: 'mercadopago', gw_token: '', gw_fallback: '1', gw_minutes: '60', gw_account: '', gw_checked: '', gw_sandbox: '0',
  gw_tok_mercadopago: '', gw_tok_asaas: '', gw_tok_pagbank: '', gw_tok_pagarme: '', gw_acc_mercadopago: '', gw_acc_asaas: '', gw_acc_pagbank: '', gw_acc_pagarme: '',
  cf_token: '', cf_zone: '', vapid_pub: '', vapid_priv: '',
  ann_on: '1', ann_title: '', ann_text: ''
};

export async function getSettings(env) {
  await ensureSchema(env);
  const r = await env.DB.prepare('SELECT key, value FROM app_settings').all();
  const s = Object.assign({}, DEFAULTS);
  for (const row of r.results || []) s[row.key] = row.value;
  return s;
}

export async function setSettings(env, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULTS)) continue;
    await env.DB.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, String(v).slice(0, 400)).run();
  }
}

export function priceOf(s, plan, period) {
  return parseInt(s['price_' + plan + '_' + (period === 'y' ? 'y' : 'm')], 10) || 0;
}

export function brl(cents) {
  return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');
}

// ---------- Pix copia e cola (BR Code) ----------
function tlv(id, value) {
  const v = String(value);
  return id + String(v.length).padStart(2, '0') + v;
}
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
const plain = (t, max) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().slice(0, max).trim();

export function pixPayload({ key, name, city, cents, txid }) {
  let p = tlv('00', '01') + tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', key)) + tlv('52', '0000') + tlv('53', '986');
  if (cents) p += tlv('54', (cents / 100).toFixed(2));
  p += tlv('58', 'BR') + tlv('59', plain(name, 25) || 'WHITELINK') + tlv('60', plain(city, 15) || 'SAO PAULO');
  p += tlv('62', tlv('05', (plain(txid, 25).replace(/ /g, '') || '***')));
  p += '6304';
  return p + crc16(p);
}

export async function newOrderCode(env) {
  for (let i = 0; i < 20; i++) {
    const n = parseInt(randomHex(3), 16) % 90000 + 10000;
    const code = 'WL' + n;
    const r = await env.DB.prepare('SELECT 1 AS x FROM orders WHERE code = ?').bind(code).first();
    if (!r) return code;
  }
  return 'WL' + Date.now().toString().slice(-7);
}

// centavos únicos: tira de 1 a 99 centavos para cada pedido aberto não repetir o valor
export async function uniqueCents(env, base) {
  const r = await env.DB.prepare("SELECT cents FROM orders WHERE status IN ('aguardando', 'conferir') AND cents BETWEEN ? AND ?").bind(base - 99, base).all();
  const used = new Set((r.results || []).map((x) => x.cents));
  for (let k = 1; k <= 99; k++) if (!used.has(base - k)) return base - k;
  return base - 1 - Math.floor(Math.random() * 99);
}

export function orderView(o, s, gwPix) {
  const PN = { ouro: 'Ouro', diamante: 'Diamante', agencia: 'Agência' };
  return {
    code: o.code, plan: o.plan, planName: PN[o.plan] || o.plan, period: o.period, periodName: o.period === 'y' ? 'anual' : 'mensal',
    cents: o.cents, value: brl(o.cents), status: o.status, method: o.method,
    createdAt: o.created_at, expiresAt: o.expires_at, sentAt: o.sent_at, paidAt: o.paid_at,
    periodStart: o.period_start, periodEnd: o.period_end, note: o.note || '', payer: o.payer || '', e2e: o.e2e || '',
    auto: o.method === 'gateway',
    pix: o.status !== 'aguardando' ? '' : o.method === 'gateway' ? (gwPix || '') : pixPayload({ key: s.pix_key, name: s.pix_name, city: s.pix_city, cents: o.cents, txid: o.code }),
    pixKey: s.pix_key, pixName: s.pix_name, whatsapp: s.whatsapp
  };
}

// libera o plano depois que o pagamento foi confirmado
export async function releaseOrder(env, o) {
  const DAY = 86400000;
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(o.user_id).first();
  const now = Date.now();
  const base = u.plan === o.plan && u.plan_until && u.plan_until > now ? u.plan_until : now;
  const days = o.period === 'y' ? 365 : 30;
  const end = base + days * DAY;
  await env.DB.prepare('UPDATE users SET plan = ?, plan_until = ?, trial_until = CASE WHEN trial_until > ? THEN ? ELSE trial_until END WHERE id = ?')
    .bind(o.plan, end, now, now, u.id).run();
  await env.DB.prepare("UPDATE orders SET status = 'liberado', paid_at = ?, period_start = ?, period_end = ? WHERE id = ?").bind(now, base, end, o.id).run();
  // fidelidade: a cada N renovações (pagamentos depois do primeiro), ganha dias grátis
  const st = await getSettings(env);
  const every = parseInt(st.loyalty_every, 10) || 3, bonus = parseInt(st.loyalty_days, 10) || 0;
  const paidN = (await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status = 'liberado'").bind(u.id).first()).n;
  if (bonus && paidN > 1 && (paidN - 1) % every === 0) {
    await env.DB.prepare('UPDATE users SET plan_until = plan_until + ? WHERE id = ?').bind(bonus * DAY, u.id).run();
    await env.DB.prepare('UPDATE orders SET period_end = period_end + ?, note = ? WHERE id = ?').bind(bonus * DAY, 'Fidelidade: +' + bonus + ' dias grátis', o.id).run();
  }
  // prêmio de indicação (libera depois de 7 dias, prazo de reembolso)
  if (u.referred_by) {
    const paidBefore = await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status = 'liberado' AND id <> ?").bind(u.id, o.id).first();
    const ref = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(u.referred_by).first();
    if (ref) {
      const count = (await env.DB.prepare("SELECT COUNT(DISTINCT friend_id) AS n FROM ref_rewards WHERE referrer_id = ? AND status <> 'cancelado'").bind(ref.id).first()).n || 0;
      const lv = count >= 15 ? [0.7, 0.2] : count >= 5 ? [0.6, 0.15] : [0.5, 0.1];
      const first = paidBefore.n === 0;
      const myPlanMonthly = ref.plan === 'diamante' && ref.plan_until > now ? 3990 : 1990;
      const paid = first && o.period === 'y' ? o.cents / 12 * 2 : o.cents;
      const d = Math.max(1, Math.floor(paid * (first ? lv[0] : lv[1]) / (myPlanMonthly / 30)));
      await env.DB.prepare("INSERT INTO ref_rewards (referrer_id, friend_id, order_id, days, status, release_at, created_at) VALUES (?, ?, ?, ?, 'aguardando', ?, ?)")
        .bind(ref.id, u.id, o.id, d, now + 7 * DAY, now).run();
    }
  }
}

// entrega os prêmios de indicação que já passaram dos 7 dias
export async function settleRewards(env, userId) {
  const now = Date.now();
  const r = await env.DB.prepare("SELECT * FROM ref_rewards WHERE referrer_id = ? AND status = 'aguardando' AND release_at <= ?").bind(userId, now).all();
  for (const w of r.results || []) {
    const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    const DAY = 86400000;
    if (u.plan !== 'prata' && u.plan_until && u.plan_until > now) {
      await env.DB.prepare('UPDATE users SET plan_until = ? WHERE id = ?').bind(Math.min(u.plan_until + w.days * DAY, now + 365 * DAY), u.id).run();
    } else {
      await env.DB.prepare("UPDATE users SET plan = 'ouro', plan_until = ? WHERE id = ?").bind(now + w.days * DAY, u.id).run();
    }
    await env.DB.prepare("UPDATE ref_rewards SET status = 'liberado' WHERE id = ?").bind(w.id).run();
  }
}
