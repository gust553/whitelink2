import { json, fail, readJson, currentUser, ensureSchema, loadPage, cleanAppearance } from '../../src/lib.js';

// Salva só a aparência (tema, cor, fonte, formato), sem mexer nos blocos
export async function onRequestPut({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = await readJson(request);
  if (!b) return fail('Dados inválidos.');
  const page = await loadPage(env, u.id);
  const appearance = cleanAppearance(b.appearance);
  await env.DB.prepare(
    `INSERT INTO page_data (user_id, blocks, appearance, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET appearance = excluded.appearance, updated_at = excluded.updated_at`
  ).bind(u.id, JSON.stringify(page.blocks), JSON.stringify(appearance), Date.now()).run();
  return json({ ok: true });
}
