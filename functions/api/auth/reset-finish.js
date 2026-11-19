import { json, fail, readJson, checkCode, passwordOk, hashPassword } from '../../../src/lib.js';

export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  if (!b) return fail('Dados inválidos.');
  if (!passwordOk(b.password)) return fail('A senha precisa ter pelo menos 8 caracteres, com letras e números.');
  const c = await checkCode(env, b.codeId, b.code, 'reset');
  if (!c.ok) return fail(c.error);
  const { userId } = JSON.parse(c.row.payload);
  const pw = await hashPassword(String(b.password));
  await env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(pw.hash, pw.salt, userId).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  return json({ ok: true });
}
