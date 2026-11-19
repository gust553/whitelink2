import { json, fail, readJson, currentUser, cleanText, cleanUrl } from '../../../src/lib.js';

async function own(env, request, params) {
  const u = await currentUser(env, request);
  if (!u) return [null, fail('Entre na sua conta.', 401)];
  const l = await env.DB.prepare('SELECT * FROM links WHERE id = ? AND user_id = ?').bind(Number(params.id) || 0, u.id).first();
  if (!l) return [null, fail('Link não encontrado.', 404)];
  return [l, null];
}

export async function onRequestPut({ request, env, params }) {
  const [l, err] = await own(env, request, params);
  if (err) return err;
  const b = (await readJson(request)) || {};
  const title = b.title !== undefined ? cleanText(b.title, 80) : l.title;
  const url = b.url !== undefined ? cleanUrl(b.url) : l.url;
  if (!title || !url) return fail('Título ou endereço inválido.');
  const active = b.active !== undefined ? (b.active ? 1 : 0) : l.active;
  let position = l.position;
  if (b.move === 'up' || b.move === 'down') {
    const other = await env.DB.prepare(
      b.move === 'up'
        ? 'SELECT id, position FROM links WHERE user_id = ? AND position < ? ORDER BY position DESC LIMIT 1'
        : 'SELECT id, position FROM links WHERE user_id = ? AND position > ? ORDER BY position ASC LIMIT 1'
    ).bind(l.user_id, l.position).first();
    if (other) {
      await env.DB.prepare('UPDATE links SET position = ? WHERE id = ?').bind(l.position, other.id).run();
      position = other.position;
    }
  }
  await env.DB.prepare('UPDATE links SET title = ?, url = ?, active = ?, position = ? WHERE id = ?').bind(title, url, active, position, l.id).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, params }) {
  const [l, err] = await own(env, request, params);
  if (err) return err;
  await env.DB.prepare('DELETE FROM links WHERE id = ?').bind(l.id).run();
  return json({ ok: true });
}
