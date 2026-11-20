import { json, fail, readJson, currentUser, ensureSchema, hashPassword, safeEqual, cleanEmail, passwordOk, getCookie, sha256, rateLimit, clientIp } from '../../../src/lib.js';

// Minha conta: aparelhos conectados, troca de e-mail e senha
export async function onRequestGet({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const mine = await sha256(getCookie(request, 'wl_s'));
  const r = await env.DB.prepare('SELECT token_hash, created_at, ip, ua FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 20').bind(u.id, Date.now()).all();
  const dev = (ua) => { ua = (ua || '').toLowerCase(); const os = /iphone|ipad/.test(ua) ? 'iPhone' : /android/.test(ua) ? 'Android' : /windows/.test(ua) ? 'Windows' : /mac os/.test(ua) ? 'Mac' : 'Aparelho'; const br = /edg/.test(ua) ? 'Edge' : /chrome|crios/.test(ua) ? 'Chrome' : /safari/.test(ua) ? 'Safari' : /firefox/.test(ua) ? 'Firefox' : 'Navegador'; return os + ' · ' + br; };
  return json({ ok: true, email: u.email, phoneEnd: String(u.phone).slice(-4), name: u.name,
    sessions: (r.results || []).map((s) => ({ id: s.token_hash.slice(0, 16), name: dev(s.ua), at: s.created_at, current: s.token_hash === mine })) });
}

export async function onRequestPut({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = (await readJson(request)) || {};
  if (!(await rateLimit(env, 'acct:' + u.id, 10, 900000))) return fail('Muitas tentativas. Espere 15 minutos.', 429);
  const pw = await hashPassword(String(b.current || ''), u.pass_salt);
  if (!safeEqual(pw.hash, u.pass_hash)) return fail('Senha atual incorreta.');
  if (b.email !== undefined) {
    const e = cleanEmail(b.email);
    if (!e) return fail('E-mail inválido.');
    const dup = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').bind(e, u.id).first();
    if (dup) return fail('Esse e-mail já é usado em outra conta.');
    await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(e, u.id).run();
    return json({ ok: true });
  }
  if (b.password !== undefined) {
    if (!passwordOk(b.password)) return fail('A nova senha precisa ter 8 caracteres, com letras e números.');
    const n = await hashPassword(String(b.password));
    await env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(n.hash, n.salt, u.id).run();
    const mine = await sha256(getCookie(request, 'wl_s'));
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').bind(u.id, mine).run();
    return json({ ok: true });
  }
  return fail('Nada para mudar.');
}

// Sair dos outros aparelhos (ou de um só)
export async function onRequestDelete({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const id = new URL(request.url).searchParams.get('id') || '';
  const mine = await sha256(getCookie(request, 'wl_s'));
  if (id) await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND substr(token_hash, 1, 16) = ? AND token_hash <> ?").bind(u.id, id, mine).run();
  else await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').bind(u.id, mine).run();
  return json({ ok: true });
}
