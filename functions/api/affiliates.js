import { json, fail, readJson, currentUser, effectivePlan, PLAN_LEVEL, cleanText, randomHex } from '../../src/lib.js';

// Parceiros (afiliados) do criador — Diamante
async function guard(env, request) {
  const u = await currentUser(env, request);
  if (!u) return [null, fail('Entre na sua conta.', 401)];
  if (PLAN_LEVEL[effectivePlan(u).plan] < 2) return [null, fail('Parceiros são do plano Diamante.', 403)];
  return [u, null];
}

export async function affReport(env, uid, code, days = 30) {
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10), fromTs = Date.now() - days * 86400000;
  const v = await env.DB.prepare('SELECT COALESCE(SUM(visits),0) AS v, COALESCE(SUM(clicks),0) AS c FROM aff_stats WHERE user_id = ? AND code = ? AND day >= ?').bind(uid, code, from).first();
  const l = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND aff = ? AND kind IN ('contato','quiz','agendamento') AND created_at >= ?").bind(uid, code, fromTs).first();
  const s = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(cents),0) AS c FROM sales WHERE user_id = ? AND aff = ? AND status IN ('pago','concluido') AND created_at >= ?").bind(uid, code, fromTs).first();
  return { visits: v.v, clicks: v.c, leads: l.n, sales: s.n, cents: s.c };
}

export async function onRequestGet({ request, env }) {
  const [u, err] = await guard(env, request);
  if (err) return err;
  const days = [7, 30, 90].includes(parseInt(new URL(request.url).searchParams.get('d'), 10)) ? parseInt(new URL(request.url).searchParams.get('d'), 10) : 30;
  const r = await env.DB.prepare('SELECT id, code, name, phone, pct, token, created_at FROM affiliates WHERE user_id = ? ORDER BY id DESC').bind(u.id).all();
  const list = [];
  for (const a of r.results || []) list.push(Object.assign(a, await affReport(env, u.id, a.code, days)));
  return json({ ok: true, handle: u.handle, days, affiliates: list });
}

export async function onRequestPost({ request, env }) {
  const [u, err] = await guard(env, request);
  if (err) return err;
  const b = (await readJson(request)) || {};
  const name = cleanText(b.name, 60);
  if (!name) return fail('Escreva o nome do parceiro.');
  const pct = Math.max(0, Math.min(90, parseInt(b.pct, 10) || 0));
  if (b.id) {
    await env.DB.prepare('UPDATE affiliates SET name = ?, phone = ?, pct = ? WHERE id = ? AND user_id = ?').bind(name, String(b.phone || '').replace(/\D/g, '').slice(0, 13), pct, parseInt(b.id, 10) || 0, u.id).run();
    return json({ ok: true });
  }
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM affiliates WHERE user_id = ?').bind(u.id).first()).n;
  if (n >= 200) return fail('Limite de 200 parceiros.');
  let code = String(b.code || name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 14) || 'parceiro';
  if (await env.DB.prepare('SELECT 1 AS x FROM affiliates WHERE user_id = ? AND code = ?').bind(u.id, code).first()) code = code.slice(0, 10) + randomHex(2);
  await env.DB.prepare('INSERT INTO affiliates (user_id, code, name, phone, pct, token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(u.id, code, name, String(b.phone || '').replace(/\D/g, '').slice(0, 13), pct, randomHex(8), Date.now()).run();
  return json({ ok: true, code });
}

export async function onRequestDelete({ request, env }) {
  const [u, err] = await guard(env, request);
  if (err) return err;
  await env.DB.prepare('DELETE FROM affiliates WHERE id = ? AND user_id = ?').bind(parseInt(new URL(request.url).searchParams.get('id'), 10) || 0, u.id).run();
  return json({ ok: true });
}
