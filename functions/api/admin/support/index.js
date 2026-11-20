import { json, requireAdmin, effectivePlan } from '../../../../src/lib.js';

// Conversas de suporte (mais recentes primeiro)
export async function onRequestGet({ request, env }) {
  const [, err] = await requireAdmin(env, request);
  if (err) return err;
  const r = await env.DB.prepare(
    `SELECT u.id, u.name, u.handle, u.plan, u.plan_until, u.trial_until, m.text, m.from_admin, m.created_at,
       (SELECT COUNT(*) FROM support_msgs x WHERE x.user_id = u.id AND x.from_admin = 0 AND x.id > COALESCE((SELECT MAX(id) FROM support_msgs a WHERE a.user_id = u.id AND a.from_admin = 1), 0)) AS waiting
     FROM support_msgs m JOIN users u ON u.id = m.user_id
     WHERE m.id = (SELECT MAX(id) FROM support_msgs y WHERE y.user_id = m.user_id)
     ORDER BY waiting > 0 DESC, m.id DESC LIMIT 100`).all();
  return json({ ok: true, threads: (r.results || []).map((t) => ({ id: t.id, name: t.name, handle: t.handle, plan: effectivePlan(t).plan, last: t.text.slice(0, 90), fromAdmin: !!t.from_admin, at: t.created_at, waiting: t.waiting })) });
}
