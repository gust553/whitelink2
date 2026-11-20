import { json, fail, readJson, requireAdmin, effectivePlan, adminLog } from '../../../../src/lib.js';
import { getSettings, orderView } from '../../../../src/billing.js';

async function load(env, params) {
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(parseInt(params.id, 10) || 0).first();
}

// Ficha do cliente
export async function onRequestGet({ request, env, params }) {
  const [, err] = await requireAdmin(env, request);
  if (err) return err;
  const u = await load(env, params);
  if (!u) return fail('Cliente não encontrado.', 404);
  const p = effectivePlan(u);
  const s = await getSettings(env);
  const orders = await env.DB.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 20').bind(u.id).all();
  const v = await env.DB.prepare('SELECT COALESCE(SUM(views),0) AS n FROM visits WHERE user_id = ?').bind(u.id).first();
  const refs = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE referred_by = ?').bind(u.id).first();
  const by = u.referred_by ? await env.DB.prepare('SELECT name, handle FROM users WHERE id = ?').bind(u.referred_by).first() : null;
  const fraud = await env.DB.prepare('SELECT kind, detail, created_at FROM fraud_log WHERE user_id = ? ORDER BY id DESC LIMIT 10').bind(u.id).all();
  return json({ ok: true, user: {
    id: u.id, name: u.name, email: u.email, phone: u.phone, instagram: u.instagram, handle: u.handle, status: u.status, admin: !!u.is_admin,
    plan: p.plan, trial: p.trial, until: p.until, paidPlan: u.plan, paidUntil: u.plan_until, trialUntil: u.trial_until, createdAt: u.created_at,
    visits: v.n, referrals: refs.n, referredBy: by ? by.name + ' (@' + by.handle + ')' : ''
  }, orders: (orders.results || []).map((o) => orderView(o, s)), fraud: fraud.results || [] });
}

// Ações: mudar plano, dar dias, encerrar teste, bloquear, desbloquear
export async function onRequestPost({ request, env, params }) {
  const [admin, err] = await requireAdmin(env, request);
  if (err) return err;
  const u = await load(env, params);
  if (!u) return fail('Cliente não encontrado.', 404);
  const b = (await readJson(request)) || {};
  const now = Date.now(), DAY = 86400000;
  if (b.action === 'plan') {
    const plan = ['prata', 'ouro', 'diamante'].includes(b.plan) ? b.plan : null;
    if (!plan) return fail('Plano inválido.');
    const days = Math.max(1, Math.min(3650, parseInt(b.days, 10) || 30));
    if (plan === 'prata') await env.DB.prepare("UPDATE users SET plan = 'prata', plan_until = NULL, trial_until = CASE WHEN trial_until > ? THEN ? ELSE trial_until END WHERE id = ?").bind(now, now, u.id).run();
    else await env.DB.prepare('UPDATE users SET plan = ?, plan_until = ? WHERE id = ?').bind(plan, now + days * DAY, u.id).run();
    await adminLog(env, admin.id, 'plano ' + plan + (plan === 'prata' ? '' : ' ' + days + 'd'), u.id);
  } else if (b.action === 'addDays') {
    const days = Math.max(1, Math.min(365, parseInt(b.days, 10) || 7));
    const p = effectivePlan(u);
    if (p.plan === 'prata') return fail('Cliente está no Prata. Use "Mudar plano".');
    if (p.trial) await env.DB.prepare('UPDATE users SET trial_until = trial_until + ? WHERE id = ?').bind(days * DAY, u.id).run();
    else await env.DB.prepare('UPDATE users SET plan_until = plan_until + ? WHERE id = ?').bind(days * DAY, u.id).run();
    await adminLog(env, admin.id, '+' + days + ' dias', u.id);
  } else if (b.action === 'endTrial') {
    await env.DB.prepare('UPDATE users SET trial_until = ? WHERE id = ? AND trial_until > ?').bind(now, u.id, now).run();
    await adminLog(env, admin.id, 'encerrou teste', u.id);
  } else if (b.action === 'block') {
    if (u.is_admin) return fail('Não dá para bloquear um admin.');
    await env.DB.prepare("UPDATE users SET status = 'bloqueado' WHERE id = ?").bind(u.id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id).run();
    await adminLog(env, admin.id, 'bloqueou', u.id);
  } else if (b.action === 'unblock') {
    await env.DB.prepare("UPDATE users SET status = 'ativo' WHERE id = ?").bind(u.id).run();
    await adminLog(env, admin.id, 'desbloqueou', u.id);
  } else return fail('Ação inválida.');
  return json({ ok: true });
}
