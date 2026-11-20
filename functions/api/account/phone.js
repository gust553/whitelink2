import { json, fail, readJson, currentUser, ensureSchema, cleanPhone, issueCode, checkCode, codeReply, rateLimit } from '../../../src/lib.js';

// Trocar o celular: manda código para o número novo e confirma
export async function onRequestPost({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = (await readJson(request)) || {};
  if (b.codeId) {
    const c = await checkCode(env, b.codeId, b.code, 'phone');
    if (!c.ok) return fail(c.error);
    const p = JSON.parse(c.row.payload);
    if (p.userId !== u.id) return fail('Código inválido.');
    const dup = await env.DB.prepare('SELECT id FROM users WHERE phone = ? AND id <> ?').bind(p.phone, u.id).first();
    if (dup) return fail('Esse celular já é usado em outra conta.');
    await env.DB.prepare('UPDATE users SET phone = ? WHERE id = ?').bind(p.phone, u.id).run();
    return json({ ok: true });
  }
  const phone = cleanPhone(b.phone);
  if (!phone) return fail('Celular inválido. Use DDD + número.');
  if (!(await rateLimit(env, 'phone:' + u.id, 4, 3600000))) return fail('Muitos códigos. Tente em 1 hora.', 429);
  const dup = await env.DB.prepare('SELECT id FROM users WHERE phone = ? AND id <> ?').bind(phone, u.id).first();
  if (dup) return fail('Esse celular já é usado em outra conta.');
  const issued = await issueCode(env, phone, 'phone', { userId: u.id, phone });
  return json(codeReply(issued, { phoneEnd: phone.slice(-4) }));
}
