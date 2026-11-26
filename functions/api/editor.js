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

// Vendas › "Mostrar na minha página": põe (ou religa) o bloco da Loja, Agenda, Apoio ou Quiz, sem mexer no resto
const SHOW = { store: 'Minha loja', booking: 'Agendar horário', support: 'Quero apoiar', quiz: 'Faça o quiz' };
export async function onRequestPost({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = (await readJson(request)) || {};
  if (!SHOW[b.show]) return fail('Pedido inválido.');
  const t = await pageTarget(env, u, request);
  if (t.missing) return fail('Página não encontrada.', 404);
  const cur = t.main ? await loadPage(env, u.id) : parsePageRow(t.row);
  const blocks = cur.blocks;
  const list = Array.isArray(blocks) ? blocks.slice() : [];
  let blk = list.find((x) => x.kind === b.show), added = false;
  if (blk) { if (blk.on === false) blk.on = true; else if (!b.force) return json({ ok: true, added: false, block: blk }); }
  else {
    blk = { id: list.reduce((m, x) => Math.max(m, +x.id || 0), 0) + 1, kind: b.show, title: SHOW[b.show], url: '', on: true };
    list.unshift(blk); added = true; // no topo, para aparecer logo
  }
  const clean = cleanBlocks(list);
  if (!clean) return fail('Não deu para salvar.');
  if (t.main) await env.DB.prepare('INSERT INTO page_data (user_id, blocks, appearance, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET blocks = excluded.blocks, updated_at = excluded.updated_at').bind(u.id, JSON.stringify(clean), JSON.stringify(cleanAppearance(cur.appearance || {})), Date.now()).run();
  else await env.DB.prepare('UPDATE pages SET blocks = ? WHERE id = ?').bind(JSON.stringify(clean), t.row.id).run();
  return json({ ok: true, added, block: blk });
}
