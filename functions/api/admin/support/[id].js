import { json, fail, readJson, requireAdmin, effectivePlan } from '../../../../src/lib.js';

export async function onRequestGet({ request, env, params }) {
  const [, err] = await requireAdmin(env, request);
  if (err) return err;
  const id = parseInt(params.id, 10) || 0;
  const u = await env.DB.prepare('SELECT id, name, email, handle, phone, plan, plan_until, trial_until FROM users WHERE id = ?').bind(id).first();
  if (!u) return fail('Cliente não encontrado.', 404);
  const r = await env.DB.prepare('SELECT id, from_admin, text, created_at, read_at FROM support_msgs WHERE user_id = ? ORDER BY id ASC LIMIT 500').bind(id).all();
  return json({ ok: true, user: { id: u.id, name: u.name, email: u.email, handle: u.handle, phone: u.phone, plan: effectivePlan(u).plan }, msgs: r.results || [] });
}

export async function onRequestPost({ request, env, params }) {
  const [, err] = await requireAdmin(env, request);
  if (err) return err;
  const id = parseInt(params.id, 10) || 0;
  const b = (await readJson(request)) || {};
  const text = String(b.text || '').trim().slice(0, 2000);
  if (!text) return fail('Escreva a resposta.');
  const u = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!u) return fail('Cliente não encontrado.', 404);
  await env.DB.prepare('INSERT INTO support_msgs (user_id, from_admin, text, created_at) VALUES (?, 1, ?, ?)').bind(id, text, Date.now()).run();
  return json({ ok: true });
}
