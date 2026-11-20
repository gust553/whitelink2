import { json, fail, currentUser, ensureSchema } from '../../src/lib.js';
import { settleRewards } from '../../src/billing.js';

// Indique e ganhe: seu código, amigos e dias ganhos
export async function onRequestGet({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  await settleRewards(env, u.id);
  const friends = await env.DB.prepare(
    `SELECT f.id, f.name, f.created_at,
      (SELECT o.plan || ' ' || CASE o.period WHEN 'y' THEN 'anual' ELSE 'mensal' END FROM orders o WHERE o.user_id = f.id AND o.status = 'liberado' ORDER BY o.id DESC LIMIT 1) AS plan
     FROM users f WHERE f.referred_by = ? ORDER BY f.id DESC LIMIT 200`).bind(u.id).all();
  const rw = await env.DB.prepare('SELECT friend_id, days, status, release_at FROM ref_rewards WHERE referrer_id = ?').bind(u.id).all();
  const byFriend = {};
  for (const r of rw.results || []) { const x = byFriend[r.friend_id] = byFriend[r.friend_id] || { days: 0, status: r.status, release: r.release_at }; x.days += r.status === 'cancelado' ? 0 : r.days; if (r.status === 'aguardando') x.status = 'aguardando'; }
  const all = rw.results || [];
  const paying = new Set(all.filter((r) => r.status !== 'cancelado').map((r) => r.friend_id)).size;
  return json({
    ok: true, code: u.ref_code, link: 'https://whitelink.site/entrar?ref=' + u.ref_code,
    earned: all.filter((r) => r.status === 'liberado').reduce((a, r) => a + r.days, 0),
    waiting: all.filter((r) => r.status === 'aguardando').reduce((a, r) => a + r.days, 0),
    paying, level: paying >= 15 ? 'Elite' : paying >= 5 ? 'Embaixador' : 'Indicador',
    friends: (friends.results || []).map((f) => ({ name: f.name.split(' ')[0], plan: f.plan || 'Prata grátis', days: (byFriend[f.id] || {}).days || 0, status: (byFriend[f.id] || {}).status || 'cadastrou', since: f.created_at }))
  });
}
