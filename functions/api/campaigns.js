import { json, fail, readJson, currentUser, effectivePlan, PLAN_LEVEL, cleanText } from '../../src/lib.js';

// Campanhas por WhatsApp (Diamante): escolhe um grupo, escreve a mensagem e envia um por um, com um toque.
async function guard(env, request) {
  const u = await currentUser(env, request);
  if (!u) return [null, fail('Entre na sua conta.', 401)];
  if (PLAN_LEVEL[effectivePlan(u).plan] < 2) return [null, fail('Campanhas são do plano Diamante.', 403)];
  return [u, null];
}

export async function onRequestGet({ request, env }) {
  const [u, err] = await guard(env, request);
  if (err) return err;
  const id = parseInt(new URL(request.url).searchParams.get('id'), 10) || 0;
  if (id) {
    const c = await env.DB.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').bind(id, u.id).first();
    if (!c) return fail('Não encontrada.', 404);
    const r = await env.DB.prepare('SELECT p.id, p.name, p.phone, s.sent_at FROM campaign_sends s JOIN people p ON p.id = s.person_id WHERE s.campaign_id = ? ORDER BY s.sent_at IS NOT NULL, p.name').bind(id).all();
    return json({ ok: true, campaign: c, people: r.results || [] });
  }
  const r = await env.DB.prepare('SELECT c.*, (SELECT COUNT(*) FROM campaign_sends s WHERE s.campaign_id = c.id AND s.sent_at IS NOT NULL) AS sent FROM campaigns c WHERE user_id = ? ORDER BY id DESC LIMIT 50').bind(u.id).all();
  return json({ ok: true, campaigns: r.results || [] });
}

export async function onRequestPost({ request, env }) {
  const [u, err] = await guard(env, request);
  if (err) return err;
  const b = (await readJson(request)) || {};
  if (b.campaign && b.person) {
    await env.DB.prepare('UPDATE campaign_sends SET sent_at = ? WHERE campaign_id = ? AND person_id = ? AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)').bind(Date.now(), b.campaign, b.person, u.id).run();
    return json({ ok: true });
  }
  const name = cleanText(b.name, 60), message = cleanText(b.message, 1000);
  if (!name || !message) return fail('Dê um nome e escreva a mensagem.');
  let where = "user_id = ? AND phone NOT LIKE 'e:%'"; const args = [u.id];
  const f = b.filter || {};
  if (f.stage) { where += ' AND stage = ?'; args.push(String(f.stage)); }
  if (f.tag) { where += " AND (',' || LOWER(tags) || ',') LIKE ?"; args.push('%,' + String(f.tag).toLowerCase() + ',%'); }
  if (f.kind) { where += ' AND id IN (SELECT person_id FROM events WHERE user_id = ? AND kind = ?)'; args.push(u.id, String(f.kind)); }
  if (f.buyers) where += ' AND total_cents > 0';
  const ppl = (await env.DB.prepare('SELECT id FROM people WHERE ' + where + ' LIMIT 2000').bind(...args).all()).results || [];
  if (!ppl.length) return fail('Nenhum contato nesse grupo.');
  const r = await env.DB.prepare('INSERT INTO campaigns (user_id, name, message, total, created_at) VALUES (?, ?, ?, ?, ?)').bind(u.id, name, message, ppl.length, Date.now()).run();
  const cid = r.meta && r.meta.last_row_id;
  for (const p of ppl) await env.DB.prepare('INSERT OR IGNORE INTO campaign_sends (campaign_id, person_id) VALUES (?, ?)').bind(cid, p.id).run();
  return json({ ok: true, id: cid, total: ppl.length });
}

export async function onRequestDelete({ request, env }) {
  const [u, err] = await guard(env, request);
  if (err) return err;
  const id = parseInt(new URL(request.url).searchParams.get('id'), 10) || 0;
  const c = await env.DB.prepare('SELECT id FROM campaigns WHERE id = ? AND user_id = ?').bind(id, u.id).first();
  if (c) { await env.DB.prepare('DELETE FROM campaign_sends WHERE campaign_id = ?').bind(id).run(); await env.DB.prepare('DELETE FROM campaigns WHERE id = ?').bind(id).run(); }
  return json({ ok: true });
}
