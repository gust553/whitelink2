import { requireAdmin, effectivePlan, adminLog } from '../../../src/lib.js';

// Admin › Clientes › Exportar: planilha (CSV que abre no Excel e no Google Planilhas) com os cadastros
export async function onRequestGet({ request, env }) {
  const [admin, err] = await requireAdmin(env, request);
  if (err) return err;
  const url = new URL(request.url);
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 60);
  const f = url.searchParams.get('f') || 'todos';
  const now = Date.now();
  let where = '1=1'; const args = [];
  if (q) { const l = '%' + q.replace(/[%_]/g, '') + '%'; const d = q.replace(/\D/g, ''); where += ' AND (LOWER(u.name) LIKE ? OR u.email LIKE ? OR u.handle LIKE ?' + (d ? ' OR u.phone LIKE ?' : '') + ')'; args.push(l, l, l); if (d) args.push('%' + d + '%'); }
  if (f === 'teste') { where += ' AND u.trial_until > ?'; args.push(now); }
  if (f === 'ouro' || f === 'diamante' || f === 'agencia') { where += ' AND u.plan = ? AND u.plan_until > ?'; args.push(f, now); }
  if (f === 'prata') { where += " AND (u.trial_until IS NULL OR u.trial_until <= ?) AND (u.plan = 'prata' OR u.plan_until IS NULL OR u.plan_until <= ?)"; args.push(now, now); }
  if (f === 'bloqueado') where += " AND u.status = 'bloqueado'";
  const r = await env.DB.prepare(`SELECT u.*, ref.handle AS ref_handle,
      (SELECT COALESCE(SUM(cents),0) FROM orders o WHERE o.user_id = u.id AND o.status = 'liberado') AS paid_cents,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status = 'liberado') AS paid_n,
      (SELECT MAX(created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login
    FROM users u LEFT JOIN users ref ON ref.id = u.referred_by WHERE ${where} ORDER BY u.id DESC LIMIT 50000`).bind(...args).all();
  const rows = r.results || [];
  const dt = (t) => { if (!t) return ''; const d = new Date(+t - 3 * 3600000).toISOString(); return d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) + ' ' + d.slice(11, 16); };
  const PN = { prata: 'Prata', ouro: 'Ouro', diamante: 'Diamante', agencia: 'Agência' };
  const brl = (c) => (c / 100).toFixed(2).replace('.', ',');
  // célula segura: aspas, e nada que o Excel execute como fórmula
  const cell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const head = ['ID', 'Nome', 'E-mail', 'Celular', 'Instagram', 'Página', 'Plano atual', 'Em teste até', 'Plano válido até', 'Situação', 'Admin', 'Cadastro', 'Último acesso', 'Indicado por', 'Pagamentos aprovados', 'Total pago (R$)'];
  const lines = [head.map(cell).join(';')];
  for (const u of rows) {
    const p = effectivePlan(u);
    lines.push([u.id, u.name, u.email, u.phone, u.instagram ? 'instagram.com/' + u.instagram : '', 'whitelink.site/' + u.handle, (PN[p.agency ? 'agencia' : p.plan] || p.plan) + (p.trial ? ' (teste)' : ''),
      u.trial_until > now ? dt(u.trial_until) : '', u.plan_until > now ? dt(u.plan_until) : '', u.status === 'bloqueado' ? 'Bloqueado' : 'Ativo', u.is_admin ? 'Sim' : '',
      dt(u.created_at), dt(u.last_login), u.ref_handle ? 'whitelink.site/' + u.ref_handle : '', u.paid_n, brl(u.paid_cents)].map(cell).join(';'));
  }
  await adminLog(env, admin.id, 'exportou ' + rows.length + ' cadastros' + (f !== 'todos' ? ' (' + f + ')' : '') + (q ? ' busca "' + q + '"' : ''), '');
  const day = new Date(now - 3 * 3600000).toISOString().slice(0, 10);
  return new Response('﻿sep=;\r\n'.slice(0, 1) + lines.join('\r\n') + '\r\n', {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="whitelink-cadastros-${day}.csv"`, 'cache-control': 'no-store' }
  });
}
