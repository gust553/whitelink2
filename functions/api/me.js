import { json, fail, readJson, currentUser, publicUser, cleanText } from '../../src/lib.js';

export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const prof = await env.DB.prepare('SELECT title, bio, theme FROM profiles WHERE user_id = ?').bind(u.id).first();
  const week = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const v = await env.DB.prepare('SELECT COALESCE(SUM(views), 0) AS n FROM visits WHERE user_id = ? AND day >= ?').bind(u.id, week).first();
  return json({ ok: true, user: publicUser(u), profile: prof || { title: u.name, bio: '', theme: 'noite' }, views7: v ? v.n : 0 });
}

// Atualiza nome da página, bio e tema
export async function onRequestPut({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = await readJson(request);
  if (!b) return fail('Dados inválidos.');
  const theme = ['noite', 'papel'].includes(b.theme) ? b.theme : 'noite';
  await env.DB.prepare(
    `INSERT INTO profiles (user_id, title, bio, theme, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET title = excluded.title, bio = excluded.bio, theme = excluded.theme, updated_at = excluded.updated_at`
  ).bind(u.id, cleanText(b.title, 60), cleanText(b.bio, 160), theme, Date.now()).run();
  return json({ ok: true });
}
