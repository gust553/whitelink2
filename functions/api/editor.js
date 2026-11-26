import { json, fail, readJson, currentUser, publicUser, ensureSchema, loadPage, cleanBlocks, cleanAppearance, cleanText, pageTarget, parsePageRow, listPages } from '../../src/lib.js';

// Editor: carrega e salva os blocos, o perfil e a aparência da página
export async function onRequestGet({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const t = await pageTarget(env, u, request);
  const pages = await listPages(env, u);
  if (t.missing) return fail('Página não encontrada.', 404, { pages });
  if (!t.main) {
    const pg = parsePageRow(t.row);
    return json({ ok: true, user: publicUser(u), page: { id: t.row.id, handle: t.row.handle }, pages, profile: { title: t.row.title || '', bio: t.row.bio || '' }, blocks: pg.blocks, appearance: pg.appearance });
  }
  const prof = (await env.DB.prepare('SELECT title, bio FROM profiles WHERE user_id = ?').bind(u.id).first()) || {};
  const page = await loadPage(env, u.id);
  return json({ ok: true, user: publicUser(u), page: { id: 0, handle: u.handle }, pages, profile: { title: prof.title || u.name, bio: prof.bio || '' }, blocks: page.blocks, appearance: page.appearance });
}

export async function onRequestPut({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = await readJson(request);
  if (!b) return fail('Dados inválidos.');
  const blocks = cleanBlocks(b.blocks);
  if (!blocks) return fail('Blocos inválidos.');
  const t = await pageTarget(env, u, request);
  if (t.missing) return fail('Página não encontrada.', 404);
  const old = t.main ? (await loadPage(env, u.id)).appearance : parsePageRow(t.row).appearance;
  // o que o editor não mandar (tema criado, foto, capa...) continua como estava
  const inA = Object.assign({}, old || {}, b.appearance || {});
  const appearance = cleanAppearance(inA);
  const now = Date.now();
  if (!t.main) {
    await env.DB.prepare('UPDATE pages SET blocks = ?, appearance = ?, title = ?, bio = ? WHERE id = ?')
      .bind(JSON.stringify(blocks), JSON.stringify(appearance), cleanText(b.title, 60), cleanText(b.bio, 160), t.row.id).run();
    return json({ ok: true });
  }
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
