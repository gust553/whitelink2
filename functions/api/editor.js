import { json, fail, readJson, currentUser, publicUser, ensureSchema, loadPage, cleanBlocks, cleanAppearance, cleanText } from '../../src/lib.js';

// Editor: carrega e salva os blocos, o perfil e a aparência da página
export async function onRequestGet({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const prof = (await env.DB.prepare('SELECT title, bio FROM profiles WHERE user_id = ?').bind(u.id).first()) || {};
  const page = await loadPage(env, u.id);
  return json({ ok: true, user: publicUser(u), profile: { title: prof.title || u.name, bio: prof.bio || '' }, blocks: page.blocks, appearance: page.appearance });
}

export async function onRequestPut({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = await readJson(request);
  if (!b) return fail('Dados inválidos.');
  const blocks = cleanBlocks(b.blocks);
  if (!blocks) return fail('Blocos inválidos.');
  const appearance = cleanAppearance(b.appearance);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO page_data (user_id, blocks, appearance, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET blocks = excluded.blocks, appearance = excluded.appearance, updated_at = excluded.updated_at`
  ).bind(u.id, JSON.stringify(blocks), JSON.stringify(appearance), now).run();
  await env.DB.prepare(
    `INSERT INTO profiles (user_id, title, bio, theme, updated_at) VALUES (?, ?, ?, 'noite', ?)
     ON CONFLICT(user_id) DO UPDATE SET title = excluded.title, bio = excluded.bio, updated_at = excluded.updated_at`
  ).bind(u.id, cleanText(b.title, 60), cleanText(b.bio, 160), now).run();
  return json({ ok: true });
}
