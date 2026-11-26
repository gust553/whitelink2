import { json, fail, readJson, currentUser, effectivePlan, PLAN_LEVEL, cleanText } from '../../src/lib.js';

// Mini-CRM: pessoas que deixaram contato, compraram, agendaram, apoiaram ou fizeram o quiz
const STAGES = ['novo', 'conversando', 'cliente', 'fiel', 'perdido'];

async function syncOld(env, uid) {
  // contatos antigos (antes do CRM) entram como pessoas
  await env.DB.prepare(`INSERT OR IGNORE INTO people (user_id, phone, name, email, created_at, last_at)
    SELECT user_id, CASE WHEN phone <> '' THEN substr(phone, -11) ELSE 'e:' || lower(email) END, name, email, MIN(created_at), MAX(created_at) FROM contacts WHERE user_id = ? AND (phone <> '' OR email <> '') GROUP BY 2`).bind(uid).run();
}

export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const lvl = PLAN_LEVEL[effectivePlan(u).plan];
  const url = new URL(request.url);
  await syncOld(env, u.id);
  const id = parseInt(url.searchParams.get('id'), 10) || 0;
  if (id) {
    const p = await env.DB.prepare('SELECT * FROM people WHERE id = ? AND user_id = ?').bind(id, u.id).first();
    if (!p) return fail('Não encontrado.', 404);
    const ev = await env.DB.prepare('SELECT kind, title, cents, aff, created_at FROM events WHERE person_id = ? AND user_id = ? ORDER BY id DESC LIMIT 100').bind(id, u.id).all();
    return json({ ok: true, level: lvl, person: p, events: ev.results || [] });
  }
  const q = String(url.searchParams.get('q') || '').toLowerCase().trim().slice(0, 60);
  const stage = STAGES.includes(url.searchParams.get('stage')) ? url.searchParams.get('stage') : '';
  const tag = cleanText(url.searchParams.get('tag'), 30).toLowerCase();
  let where = 'user_id = ?'; const args = [u.id];
  if (q) { where += ' AND (LOWER(name) LIKE ? OR phone LIKE ? OR LOWER(tags) LIKE ?)'; const l = '%' + q.replace(/[%_]/g, '') + '%'; args.push(l, '%' + (q.replace(/\D/g, '') || '~') + '%', l); }
  if (stage && lvl >= 2) { where += ' AND stage = ?'; args.push(stage); }
  if (tag && lvl >= 2) { where += " AND (',' || LOWER(tags) || ',') LIKE ?"; args.push('%,' + tag + ',%'); }
  const r = await env.DB.prepare(`SELECT p.id, p.name, p.phone, p.email, p.stage, p.tags, p.total_cents, p.created_at, p.last_at,
     (SELECT kind || '|' || COALESCE(title,'') FROM events e WHERE e.person_id = p.id ORDER BY e.id DESC LIMIT 1) AS last
     FROM people p WHERE ${where} ORDER BY last_at DESC LIMIT 1000`).bind(...args).all();
  const list = r.results || [];
  if (url.searchParams.get('csv')) {
    if (lvl < 2) return fail('Baixar a planilha é do Diamante.', 403);
    const csv = 'nome;whatsapp;email;etapa;etiquetas;total gasto;primeiro contato;último contato\n' + list.map((p) => ['name', 'phone', 'email', 'stage', 'tags'].map((k) => '"' + String(p[k] || '').replace(/"/g, '""') + '"').join(';') + ';' + (p.total_cents / 100).toFixed(2).replace('.', ',') + ';' + new Date(p.created_at).toLocaleDateString('pt-BR') + ';' + new Date(p.last_at).toLocaleDateString('pt-BR')).join('\n');
    return new Response('﻿' + csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="whitelink-clientes.csv"' } });
  }
  const st = await env.DB.prepare('SELECT stage, COUNT(*) AS n FROM people WHERE user_id = ? GROUP BY stage').bind(u.id).all();
  const tg = await env.DB.prepare("SELECT tags FROM people WHERE user_id = ? AND tags <> '' LIMIT 2000").bind(u.id).all();
  const tags = {};
  for (const x of tg.results || []) for (const t of x.tags.split(',')) if (t.trim()) tags[t.trim().toLowerCase()] = (tags[t.trim().toLowerCase()] || 0) + 1;
  return json({ ok: true, level: lvl, people: list, stages: st.results || [], tags: Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([t, n]) => ({ t, n })) });
}

export async function onRequestPut({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const lvl = PLAN_LEVEL[effectivePlan(u).plan];
  const b = (await readJson(request)) || {};
  const p = await env.DB.prepare('SELECT id FROM people WHERE id = ? AND user_id = ?').bind(parseInt(b.id, 10) || 0, u.id).first();
  if (!p) return fail('Não encontrado.', 404);
  if (b.name !== undefined) await env.DB.prepare('UPDATE people SET name = ? WHERE id = ?').bind(cleanText(b.name, 60), p.id).run();
  if (lvl >= 2) {
    if (STAGES.includes(b.stage)) await env.DB.prepare('UPDATE people SET stage = ? WHERE id = ?').bind(b.stage, p.id).run();
    if (b.tags !== undefined) await env.DB.prepare('UPDATE people SET tags = ? WHERE id = ?').bind(String(b.tags).split(',').map((t) => cleanText(t, 30).toLowerCase()).filter(Boolean).slice(0, 10).join(','), p.id).run();
    if (b.notes !== undefined) await env.DB.prepare('UPDATE people SET notes = ? WHERE id = ?').bind(cleanText(b.notes, 1000), p.id).run();
  }
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const id = parseInt(new URL(request.url).searchParams.get('id'), 10) || 0;
  await env.DB.prepare('DELETE FROM people WHERE id = ? AND user_id = ?').bind(id, u.id).run();
  await env.DB.prepare('UPDATE events SET person_id = NULL WHERE person_id = ? AND user_id = ?').bind(id, u.id).run();
  return json({ ok: true });
}
