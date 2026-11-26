import { json, fail, currentUser } from '../../src/lib.js';

// Avisos do painel (sino)
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const url = new URL(request.url);
  if (url.searchParams.get('count')) {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(u.id).first();
    return json({ ok: true, unread: r.n });
  }
  const r = await env.DB.prepare('SELECT id, kind, text, url, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100').bind(u.id).all();
  await env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(Date.now(), u.id).run();
  return json({ ok: true, items: r.results || [] });
}
