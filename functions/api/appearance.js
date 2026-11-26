import { json, fail, readJson, currentUser, ensureSchema, loadPage, cleanAppearance, pageTarget, parsePageRow } from '../../src/lib.js';

// Salva só a aparência (tema, cor, fonte, formato), sem mexer nos blocos. ?p=ID para uma página extra.
export async function onRequestPut({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = await readJson(request);
  if (!b) return fail('Dados inválidos.');
  const t = await pageTarget(env, u, request);
  if (t.missing) return fail('Página não encontrada.', 404);
  const page = t.main ? await loadPage(env, u.id) : parsePageRow(t.row);
  const inA = b.appearance || {};
  // telas de Aparência/Temas não mandam o tema criado: guardamos o que já existia
  if (inA.custom === undefined) { inA.custom = page.appearance && page.appearance.custom; if (inA.useCustom === undefined) inA.useCustom = false; }
  const appearance = cleanAppearance(inA);
  if (!t.main) {
    await env.DB.prepare('UPDATE pages SET appearance = ? WHERE id = ?').bind(JSON.stringify(appearance), t.row.id).run();
    return json({ ok: true });
  }
  await env.DB.prepare(
    `INSERT INTO page_data (user_id, blocks, appearance, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET appearance = excluded.appearance, updated_at = excluded.updated_at`
  ).bind(u.id, JSON.stringify(page.blocks), JSON.stringify(appearance), Date.now()).run();
  return json({ ok: true });
}
