import { json, fail, readJson, currentUser } from '../../src/lib.js';
import { addPaid, notify } from '../../src/crm.js';

// Pedidos, agendamentos e apoios recebidos pelo criador
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const url = new URL(request.url);
  const kind = ['pedido', 'agendamento', 'apoio'].includes(url.searchParams.get('k')) ? url.searchParams.get('k') : '';
  const r = await env.DB.prepare(`SELECT id, kind, code, name, phone, items, cents, status, start_ts, service, message, aff, created_at FROM sales WHERE user_id = ? ${kind ? 'AND kind = ?' : ''} ORDER BY ${kind === 'agendamento' ? 'start_ts DESC' : 'id DESC'} LIMIT 300`)
    .bind(...(kind ? [u.id, kind] : [u.id])).all();
  const sums = await env.DB.prepare("SELECT kind, status, COUNT(*) AS n, COALESCE(SUM(cents),0) AS c FROM sales WHERE user_id = ? AND created_at > ? GROUP BY kind, status").bind(u.id, Date.now() - 30 * 86400000).all();
  return json({ ok: true, sales: (r.results || []).map((x) => Object.assign(x, { items: x.items ? JSON.parse(x.items) : [] })), sums: sums.results || [] });
}

// Mudar a situação: pago, concluido, cancelado
export async function onRequestPost({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = (await readJson(request)) || {};
  const st = ['aguardando', 'confirmado', 'pago', 'concluido', 'cancelado'].includes(b.status) ? b.status : null;
  if (!st) return fail('Situação inválida.');
  const s = await env.DB.prepare('SELECT * FROM sales WHERE id = ? AND user_id = ?').bind(parseInt(b.id, 10) || 0, u.id).first();
  if (!s) return fail('Não encontrado.', 404);
  await env.DB.prepare('UPDATE sales SET status = ? WHERE id = ?').bind(st, s.id).run();
  if (st === 'pago' && s.status !== 'pago') {
    await addPaid(env, u.id, s.person_id, s.cents);
    if (s.aff) await env.DB.prepare("INSERT INTO events (user_id, person_id, kind, title, cents, ref, aff, created_at) VALUES (?, ?, 'venda_afiliado', ?, ?, ?, ?, ?)").bind(u.id, s.person_id, s.code, s.cents, s.code, s.aff, Date.now()).run();
  }
  return json({ ok: true });
}
