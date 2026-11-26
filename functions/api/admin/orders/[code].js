import { json, fail, readJson, requireAdmin, cleanText, adminLog } from '../../../../src/lib.js';
import { getSettings, orderView, releaseOrder } from '../../../../src/billing.js';

async function load(env, params) {
  return env.DB.prepare('SELECT * FROM orders WHERE code = ?').bind(String(params.code || '').toUpperCase()).first();
}

// Detalhe do pedido, com comprovante e verificações automáticas
export async function onRequestGet({ request, env, params }) {
  const [, err] = await requireAdmin(env, request);
  if (err) return err;
  const o = await load(env, params);
  if (!o) return fail('Pedido não encontrado.', 404);
  const u = await env.DB.prepare('SELECT id, name, email, phone, handle, plan, plan_until, trial_until, status, created_at FROM users WHERE id = ?').bind(o.user_id).first();
  const checks = [];
  checks.push({ ok: true, t: 'Valor do pedido: R$ ' + (o.cents / 100).toFixed(2).replace('.', ',') + ' (confira os centavos no extrato)' });
  if (o.e2e) {
    const dup = await env.DB.prepare('SELECT code FROM orders WHERE e2e = ? AND id <> ? LIMIT 1').bind(o.e2e, o.id).first();
    checks.push(dup ? { ok: false, t: 'ID da transação já usado no pedido ' + dup.code } : { ok: true, t: 'ID da transação nunca usado antes' });
  }
  if (o.payer) {
    const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/)[0];
    checks.push(norm(o.payer) === norm(u.name) ? { ok: true, t: 'Nome de quem pagou parece com o do cadastro' } : { ok: false, t: 'Nome de quem pagou (' + o.payer + ') é diferente do cadastro (' + u.name + ')' });
  }
  if (o.sent_at && o.sent_at > o.expires_at) checks.push({ ok: false, t: 'Comprovante enviado depois do vencimento do pedido' });
  const prev = await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status = 'liberado'").bind(u.id).first();
  checks.push({ ok: true, t: prev.n ? 'Cliente já pagou ' + prev.n + ' vez(es) antes' : 'Primeiro pagamento deste cliente' });
  const s = await getSettings(env);
  return json({ ok: true, order: Object.assign(orderView(o, s), { proof: o.proof || '', bank: o.bank || '' }), user: u, checks });
}

// Liberar, recusar ou bloquear
export async function onRequestPost({ request, env, params }) {
  const [admin, err] = await requireAdmin(env, request);
  if (err) return err;
  const o = await load(env, params);
  if (!o) return fail('Pedido não encontrado.', 404);
  const b = (await readJson(request)) || {};
  if (['approve', 'reject', 'block'].includes(b.action)) await adminLog(env, admin.id, { approve: 'liberou', reject: 'recusou', block: 'bloqueou (fraude)' }[b.action] + ' pedido ' + o.code, o.user_id);
  if (b.action === 'approve') {
    if (!['conferir', 'aguardando', 'recusado'].includes(o.status)) return fail('Este pedido não pode ser liberado.');
    await releaseOrder(env, o);
    return json({ ok: true });
  }
  if (b.action === 'reject') {
    await env.DB.prepare("UPDATE orders SET status = 'recusado', note = ? WHERE id = ?").bind(cleanText(b.note, 200) || 'Não encontramos esse Pix no extrato.', o.id).run();
    return json({ ok: true });
  }
  if (b.action === 'block') {
    const tu = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(o.user_id).first();
    if (tu && tu.is_admin) return fail('Não dá para bloquear um admin.');
    await env.DB.prepare("UPDATE orders SET status = 'bloqueado', note = ? WHERE id = ?").bind(cleanText(b.note, 200) || 'Pagamento com indício de fraude.', o.id).run();
    await env.DB.prepare("UPDATE users SET status = 'bloqueado' WHERE id = ?").bind(o.user_id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(o.user_id).run();
    await env.DB.prepare("UPDATE ref_rewards SET status = 'cancelado' WHERE friend_id = ?").bind(o.user_id).run();
    return json({ ok: true });
  }
  return fail('Ação inválida.');
}
