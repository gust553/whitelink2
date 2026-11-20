import { json, fail, currentUser, ensureSchema, effectivePlan, PLAN_LEVEL } from '../../src/lib.js';

// Contatos captados na página
export async function onRequestGet({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const lvl = PLAN_LEVEL[effectivePlan(u).plan];
  const url = new URL(request.url);
  const r = await env.DB.prepare('SELECT id, name, phone, email, source, created_at FROM contacts WHERE user_id = ? ORDER BY id DESC LIMIT 2000').bind(u.id).all();
  const list = r.results || [];
  if (url.searchParams.get('csv')) {
    if (lvl < 2) return fail('Exportar contatos é do Diamante.', 403);
    const csv = 'nome;whatsapp;email;origem;data\n' + list.map((c) => ['name', 'phone', 'email', 'source'].map((k) => '"' + String(c[k] || '').replace(/"/g, '""') + '"').join(';') + ';' + new Date(c.created_at).toLocaleString('pt-BR')).join('\n');
    return new Response('﻿' + csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="whitelink-contatos.csv"' } });
  }
  return json({ ok: true, level: lvl, contacts: list });
}

export async function onRequestDelete({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const id = parseInt(new URL(request.url).searchParams.get('id'), 10) || 0;
  await env.DB.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').bind(id, u.id).run();
  return json({ ok: true });
}
