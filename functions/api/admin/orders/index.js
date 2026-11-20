import { json, requireAdmin } from '../../../../src/lib.js';
import { getSettings, orderView } from '../../../../src/billing.js';

// Fila de pagamentos do admin
export async function onRequestGet({ request, env }) {
  const [, err] = await requireAdmin(env, request);
  if (err) return err;
  const st = new URL(request.url).searchParams.get('s') || 'conferir';
  const allowed = { conferir: ['conferir'], aguardando: ['aguardando'], liberado: ['liberado'], recusado: ['recusado', 'bloqueado', 'cancelado', 'vencido'] };
  const list = allowed[st] || allowed.conferir;
  await env.DB.prepare("UPDATE orders SET status = 'vencido' WHERE status = 'aguardando' AND expires_at < ?").bind(Date.now()).run();
  const r = await env.DB.prepare(
    `SELECT o.id, o.code, o.user_id, o.plan, o.period, o.cents, o.method, o.status, o.payer, o.bank, o.e2e, o.note, o.created_at, o.expires_at, o.sent_at, o.paid_at, o.period_start, o.period_end,
            u.name AS uname, u.email AS uemail, u.handle AS uhandle
     FROM orders o JOIN users u ON u.id = o.user_id WHERE o.status IN (${list.map(() => '?').join(',')}) ORDER BY o.id DESC LIMIT 100`
  ).bind(...list).all();
  const c = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").all();
  const counts = {};
  for (const x of c.results || []) counts[x.status] = x.n;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sum = await env.DB.prepare("SELECT COALESCE(SUM(cents),0) AS c, COUNT(*) AS n FROM orders WHERE status = 'liberado' AND paid_at >= ?").bind(today.getTime()).first();
  const s = await getSettings(env);
  return json({ ok: true, counts, today: { cents: sum.c, n: sum.n }, orders: (r.results || []).map((o) => Object.assign(orderView(o, s), { user: { name: o.uname, email: o.uemail, handle: o.uhandle } })) });
}
