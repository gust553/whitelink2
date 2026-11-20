import { json, fail, readJson, requireAdmin, adminLog } from '../../../src/lib.js';

// Prêmios de indicação: lista e cancelamento (ex.: reembolso ou fraude)
export async function onRequestGet({ request, env }) {
  const [, err] = await requireAdmin(env, request);
  if (err) return err;
  const r = await env.DB.prepare(
    `SELECT w.id, w.days, w.status, w.release_at, w.created_at, a.name AS rname, a.handle AS rhandle, f.name AS fname, f.handle AS fhandle, o.code, o.cents
     FROM ref_rewards w JOIN users a ON a.id = w.referrer_id JOIN users f ON f.id = w.friend_id LEFT JOIN orders o ON o.id = w.order_id
     ORDER BY w.id DESC LIMIT 200`).all();
  const top = await env.DB.prepare(
    `SELECT a.name, a.handle, COUNT(*) AS friends, SUM(CASE WHEN w.status = 'liberado' THEN w.days ELSE 0 END) AS days
     FROM ref_rewards w JOIN users a ON a.id = w.referrer_id WHERE w.status <> 'cancelado' GROUP BY w.referrer_id ORDER BY friends DESC LIMIT 10`).all();
  const signups = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE referred_by IS NOT NULL').first();
  return json({ ok: true, rewards: r.results || [], top: top.results || [], signups: signups.n });
}

export async function onRequestPost({ request, env }) {
  const [admin, err] = await requireAdmin(env, request);
  if (err) return err;
  const b = (await readJson(request)) || {};
  const id = parseInt(b.id, 10) || 0;
  const w = await env.DB.prepare("SELECT * FROM ref_rewards WHERE id = ? AND status = 'aguardando'").bind(id).first();
  if (!w) return fail('Só dá para cancelar prêmios que ainda estão aguardando.');
  await env.DB.prepare("UPDATE ref_rewards SET status = 'cancelado' WHERE id = ?").bind(id).run();
  await adminLog(env, admin.id, 'cancelou prêmio de indicação', id);
  return json({ ok: true });
}
