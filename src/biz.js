// Vendas do criador: loja, agenda, apoios e quiz.
import { getUserSettings, randomHex } from './lib.js';
import { pixPayload, brl } from './billing.js';

export const TZ = -3 * 3600000; // horário de Brasília
export const PRODUCT_LIMIT = [0, 10, 500];
export const SERVICE_LIMIT = [0, 1, 30];
export const QUIZ_LIMIT = [0, 1, 30];

export function newCode(prefix) { return prefix + randomHex(3).toUpperCase(); }

// Pix copia e cola na chave do criador, com o valor certo
export function creatorPix(st, cents, code) {
  const p = st.pay || {};
  if (!p.key) return '';
  return pixPayload({ key: p.key, name: p.name || 'RECEBEDOR', city: p.city || 'SAO PAULO', cents, txid: code });
}

export function creatorWa(st, u) {
  const p = (st.pay && st.pay.wa) || u.phone || '';
  return p ? (p.length <= 11 ? '55' : '') + p : '';
}

export function waLink(num, text) { return 'https://wa.me/' + num + '?text=' + encodeURIComponent(text); }

// Agenda padrão
export function agendaCfg(st) {
  const a = st.agenda || {};
  return {
    services: Array.isArray(a.services) ? a.services : [],
    days: Array.isArray(a.days) && a.days.length === 7 ? a.days : [false, true, true, true, true, true, false],
    from: /^\d\d:\d\d$/.test(a.from || '') ? a.from : '09:00',
    to: /^\d\d:\d\d$/.test(a.to || '') ? a.to : '18:00',
    step: [15, 20, 30, 45, 60, 90, 120].includes(+a.step) ? +a.step : 30,
    blocked: Array.isArray(a.blocked) ? a.blocked.slice(0, 200) : [],
    ahead: Math.min(90, Math.max(1, +a.ahead || 30))
  };
}

const mins = (hhmm) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
// dia "AAAA-MM-DD" + minutos -> horário em ms (Brasília)
export function tsOf(day, m) { return Date.parse(day + 'T00:00:00Z') + m * 60000 - TZ; }
export function dayOf(ts) { return new Date(ts + TZ).toISOString().slice(0, 10); }

// Horários livres de um dia para um serviço
export async function freeSlots(env, userId, cfg, svc, day) {
  const now = Date.now();
  const dow = new Date(day + 'T12:00:00Z').getUTCDay();
  if (!cfg.days[dow] || cfg.blocked.includes(day)) return [];
  if (tsOf(day, 0) > now + cfg.ahead * 86400000) return [];
  const start = tsOf(day, 0), end = start + 86400000;
  const r = await env.DB.prepare("SELECT start_ts, service FROM sales WHERE user_id = ? AND kind = 'agendamento' AND status <> 'cancelado' AND start_ts >= ? AND start_ts < ?").bind(userId, start - 86400000, end).all();
  const busy = (r.results || []).map((b) => { const s2 = cfg.services.find((x) => x.id === b.service); return [b.start_ts, b.start_ts + ((s2 && s2.minutes) || cfg.step) * 60000]; });
  const out = [];
  for (let m = mins(cfg.from); m + svc.minutes <= mins(cfg.to); m += cfg.step) {
    const a = tsOf(day, m), z = a + svc.minutes * 60000;
    if (a < now + 30 * 60000) continue;
    if (busy.some(([x, y]) => a < y && z > x)) continue;
    out.push({ ts: a, label: String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') });
  }
  return out;
}

export async function bizSettings(env, userId) { return getUserSettings(env, userId); }
export { brl };
