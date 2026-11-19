import { fail, readJson, cleanEmail, hashPassword, safeEqual, createSession, rateLimit, clientIp } from '../../../src/lib.js';

export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  const email = cleanEmail(b && b.email);
  if (!email || !b.password) return fail('Preencha o e-mail e a senha.');
  if (!(await rateLimit(env, 'login-ip:' + clientIp(request), 20, 900000))) return fail('Muitas tentativas. Espere 15 minutos.', 429);
  if (!(await rateLimit(env, 'login-mail:' + email, 5, 900000))) return fail('Muitas tentativas nesta conta. Espere 15 minutos ou recupere a senha.', 429);
  const u = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!u) return fail('E-mail ou senha incorretos.');
  const h = await hashPassword(String(b.password), u.pass_salt);
  if (!safeEqual(h.hash, u.pass_hash)) return fail('E-mail ou senha incorretos.');
  if (u.status === 'bloqueado') return fail('Esta conta está bloqueada. Fale com o suporte.', 403);
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  headers.append('set-cookie', await createSession(env, request, u.id));
  return new Response(JSON.stringify({ ok: true, admin: !!u.is_admin }), { headers });
}
