import { json, fail, readJson, cleanEmail, issueCode, codeReply, rateLimit, clientIp } from '../../../src/lib.js';

// Esqueci a senha: manda código por SMS para o celular da conta
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  const email = cleanEmail(b && b.email);
  if (!email) return fail('E-mail inválido.');
  if (!(await rateLimit(env, 'reset-ip:' + clientIp(request), 6, 3600000))) return fail('Muitas tentativas. Tente mais tarde.', 429);
  const u = await env.DB.prepare('SELECT id, phone FROM users WHERE email = ?').bind(email).first();
  if (!u) return fail('Não achamos conta com esse e-mail.');
  if (!(await rateLimit(env, 'reset-user:' + u.id, 3, 3600000))) return fail('Muitos códigos pedidos. Tente em 1 hora.', 429);
  const issued = await issueCode(env, u.phone, 'reset', { userId: u.id });
  return json(codeReply(issued, { phoneEnd: String(u.phone).slice(-4) }));
}
