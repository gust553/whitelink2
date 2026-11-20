import { json, requireAdmin, effectivePlan } from '../../../../src/lib.js';

// Lista e busca de clientes
export async function onRequestGet({ request, env }) {
  const [, err] = await requireAdmin(env, request);
  if (err) return err;
  const url = new URL(request.url);
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 60);
  const f = url.searchParams.get('f') || 'todos';
  const now = Date.now();
  let where = '1=1'; const args = [];
  if (q) { where += ' AND (LOWER(name) LIKE ? OR email LIKE ? OR handle LIKE ? OR phone LIKE ?)'; const l = '%' + q.replace(/[%_]/g, '') + '%'; args.push(l, l, l, '%' + q.replace(/\D/g, '') + '%'); if (!q.replace(/\D/g, '')) args[3] = '%~%'; }
  if (f === 'teste') { where += ' AND trial_until > ?'; args.push(now); }
  if (f === 'ouro' || f === 'diamante') { where += ' AND plan = ? AND plan_until > ?'; args.push(f, now); }
  if (f === 'prata') { where += " AND (trial_until IS NULL OR trial_until <= ?) AND (plan = 'prata' OR plan_until IS NULL OR plan_until <= ?)"; args.push(now, now); }
  if (f === 'bloqueado') where += " AND status = 'bloqueado'";
  const r = await env.DB.prepare(`SELECT id, name, email, phone, handle, plan, plan_until, trial_until, status, is_admin, created_at FROM users WHERE ${where} ORDER BY id DESC LIMIT 100`).bind(...args).all();
  return json({ ok: true, users: (r.results || []).map((u) => { const p = effectivePlan(u); return { id: u.id, name: u.name, email: u.email, handle: u.handle, plan: p.plan, trial: p.trial, until: p.until, status: u.status, admin: !!u.is_admin, createdAt: u.created_at }; }) });
}
