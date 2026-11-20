import { json, requireAdmin } from '../../../src/lib.js';
import { brl } from '../../../src/billing.js';

// Visão geral do negócio
export async function onRequestGet({ request, env }) {
  const [, err] = await requireAdmin(env, request);
  if (err) return err;
  const now = Date.now(), DAY = 86400000;
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })); today.setHours(0, 0, 0, 0);
  const t0 = now - (Date.now() - today.getTime()) % DAY;
  const month0 = now - 30 * DAY;
  const one = (q, ...a) => env.DB.prepare(q).bind(...a).first();
  const total = await one('SELECT COUNT(*) AS n FROM users');
  const newToday = await one('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', t0);
  const trials = await one('SELECT COUNT(*) AS n FROM users WHERE trial_until > ?', now);
  const ouro = await one("SELECT COUNT(*) AS n FROM users WHERE plan = 'ouro' AND plan_until > ?", now);
  const dia = await one("SELECT COUNT(*) AS n FROM users WHERE plan = 'diamante' AND plan_until > ?", now);
  const rev30 = await one("SELECT COALESCE(SUM(cents),0) AS c, COUNT(*) AS n FROM orders WHERE status = 'liberado' AND paid_at >= ?", month0);
  const revToday = await one("SELECT COALESCE(SUM(cents),0) AS c, COUNT(*) AS n FROM orders WHERE status = 'liberado' AND paid_at >= ?", t0);
  const toCheck = await one("SELECT COUNT(*) AS n FROM orders WHERE status = 'conferir'");
  const unread = await one('SELECT COUNT(DISTINCT user_id) AS n FROM support_msgs m WHERE from_admin = 0 AND id > COALESCE((SELECT MAX(id) FROM support_msgs a WHERE a.user_id = m.user_id AND a.from_admin = 1), 0)');
  const blockedTrials = await one("SELECT COUNT(*) AS n FROM fraud_log WHERE kind = 'trial_negado' AND created_at >= ?", now - 7 * DAY);
  const expiring = await one("SELECT COUNT(*) AS n FROM users WHERE plan <> 'prata' AND plan_until BETWEEN ? AND ?", now, now + 3 * DAY);
  const sig = await env.DB.prepare('SELECT created_at FROM users WHERE created_at >= ?').bind(now - 14 * DAY).all();
  const series = Array.from({ length: 14 }, () => 0);
  for (const r of sig.results || []) { const i = 13 - Math.floor((now - r.created_at) / DAY); if (i >= 0 && i < 14) series[i]++; }
  const paying = ouro.n + dia.n;
  const mrrRow = await env.DB.prepare("SELECT plan, period, cents FROM orders o WHERE status = 'liberado' AND period_end > ? AND id = (SELECT MAX(id) FROM orders x WHERE x.user_id = o.user_id AND x.status = 'liberado')").bind(now).all();
  const mrr = (mrrRow.results || []).reduce((a, o) => a + (o.period === 'y' ? o.cents / 12 : o.cents), 0);
  return json({
    ok: true,
    kpis: { users: total.n, newToday: newToday.n, trials: trials.n, ouro: ouro.n, diamante: dia.n, paying, conv: total.n ? Math.round(paying / total.n * 1000) / 10 : 0 },
    money: { mrr: brl(Math.round(mrr)), rev30: brl(rev30.c), rev30n: rev30.n, today: brl(revToday.c), todayN: revToday.n },
    alerts: { toCheck: toCheck.n, unread: unread.n, blockedTrials: blockedTrials.n, expiring: expiring.n },
    series
  });
}
