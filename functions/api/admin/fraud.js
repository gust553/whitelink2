import { json, requireAdmin } from '../../../src/lib.js';

// Antifraude: testes negados, clientes bloqueados, pagamentos bloqueados, celulares com muitos códigos
export async function onRequestGet({ request, env }) {
  const [, err] = await requireAdmin(env, request);
  if (err) return err;
  const now = Date.now(), DAY = 86400000;
  const KIND = { email: 'e-mail', phone: 'celular', instagram: 'Instagram', device: 'aparelho' };
  const log = await env.DB.prepare(
    `SELECT f.id, f.kind, f.detail, f.ip, f.created_at, u.id AS uid, u.name, u.handle FROM fraud_log f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT 100`).all();
  const blocked = await env.DB.prepare("SELECT id, name, email, handle, created_at FROM users WHERE status = 'bloqueado' ORDER BY id DESC LIMIT 100").all();
  const badOrders = await env.DB.prepare("SELECT o.code, o.cents, o.note, o.created_at, u.name FROM orders o JOIN users u ON u.id = o.user_id WHERE o.status = 'bloqueado' ORDER BY o.id DESC LIMIT 50").all();
  const sameIp = await env.DB.prepare("SELECT ip, COUNT(DISTINCT user_id) AS n FROM sessions WHERE created_at > ? AND ip <> '0.0.0.0' GROUP BY ip HAVING n >= 3 ORDER BY n DESC LIMIT 20").bind(now - 7 * DAY).all();
  const trials = await env.DB.prepare('SELECT COUNT(*) AS n FROM trial_registry WHERE kind = ?').bind('email').first();
  return json({
    ok: true, trialsGiven: trials.n,
    denied: (log.results || []).filter((x) => x.kind === 'trial_negado').map((x) => ({ uid: x.uid, name: x.name, handle: x.handle, why: 'Mesmo ' + (KIND[x.detail] || x.detail) + ' de um teste anterior', at: x.created_at })),
    blocked: blocked.results || [], badOrders: badOrders.results || [], sameIp: sameIp.results || []
  });
}
