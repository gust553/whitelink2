import { json, fail, readJson, ensureSchema, cleanText, cleanEmail, rateLimit, clientIp, effectivePlan, PLAN_LEVEL } from '../../src/lib.js';

// Captura de contato feita na página pública de um cliente
export async function onRequestPost({ request, env }) {
  await ensureSchema(env);
  const b = await readJson(request);
  if (!b) return fail('Dados inválidos.');
  if (!(await rateLimit(env, 'lead:' + clientIp(request), 10, 3600000))) return fail('Muitas tentativas. Tente mais tarde.', 429);
  const u = await env.DB.prepare('SELECT id, plan, plan_until, trial_until FROM users WHERE handle = ? AND status = ?').bind(String(b.h || '').toLowerCase(), 'ativo').first();
  if (!u || PLAN_LEVEL[effectivePlan(u).plan] < 1) return fail('Página não encontrada.', 404);
  const phone = String(b.phone || '').replace(/\D/g, '').slice(0, 13);
  const email = cleanEmail(b.email);
  const name = cleanText(b.name, 60);
  if (phone.length < 10 && !email) return fail('Escreva seu WhatsApp com DDD.');
  await env.DB.prepare('INSERT INTO contacts (user_id, name, phone, email, source, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(u.id, name, phone, email, cleanText(b.source, 80), Date.now()).run();
  return json({ ok: true });
}
