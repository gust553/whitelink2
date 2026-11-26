import { json, fail, readJson, ensureSchema, cleanText, cleanEmail, rateLimit, clientIp, effectivePlan, PLAN_LEVEL, getCookie } from '../../src/lib.js';
import { track, notify } from '../../src/crm.js';

// Captura de contato feita na página pública de um cliente
export async function onRequestPost({ request, env }) {
  await ensureSchema(env);
  const b = await readJson(request);
  if (!b) return fail('Dados inválidos.');
  if (!(await rateLimit(env, 'lead:' + clientIp(request), 10, 3600000))) return fail('Muitas tentativas. Tente mais tarde.', 429);
  const hh = String(b.h || '').toLowerCase();
  let u = await env.DB.prepare('SELECT id, plan, plan_until, trial_until FROM users WHERE handle = ? AND status = ?').bind(hh, 'ativo').first();
  if (!u) u = await env.DB.prepare("SELECT u.id, u.plan, u.plan_until, u.trial_until FROM pages p JOIN users u ON u.id = p.user_id WHERE p.handle = ? AND u.status = 'ativo'").bind(hh).first();
  if (!u || PLAN_LEVEL[effectivePlan(u).plan] < 1) return fail('Página não encontrada.', 404);
  const phone = String(b.phone || '').replace(/\D/g, '').slice(0, 13);
  const email = cleanEmail(b.email);
  const name = cleanText(b.name, 60);
  if (phone.length < 10 && !email) return fail('Escreva seu WhatsApp com DDD.');
  await env.DB.prepare('INSERT INTO contacts (user_id, name, phone, email, source, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(u.id, name, phone, email, cleanText(b.source, 80), Date.now()).run();
  const aff = String(getCookie(request, 'wl_a' + u.id) || '').replace(/[^a-z0-9]/gi, '').slice(0, 20);
  await track(env, u.id, { phone, name, email, kind: 'contato', title: cleanText(b.source, 80) || 'Deixou o contato', aff });
  await notify(env, u.id, 'contato', 'Novo contato: ' + (name || phone), '/painel/clientes');
  return json({ ok: true });
}
