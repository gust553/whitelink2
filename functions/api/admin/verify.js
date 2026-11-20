import { json, fail, readJson, requireAdmin, issueCode, checkCode, codeReply, sha256, getCookie, rateLimit } from '../../../src/lib.js';

// Entrada do admin: além da senha, um código por SMS no celular do admin (vale 12 horas neste aparelho)
export async function onRequestGet({ request, env }) {
  const [u, err] = await requireAdmin(env, request, { skip2fa: true });
  if (err) return err;
  const ok = await env.DB.prepare('SELECT until FROM admin_2fa WHERE token_hash = ? AND until > ?').bind(await sha256(getCookie(request, 'wl_s')), Date.now()).first();
  return json({ ok: true, verified: !!ok, name: u.name, phoneEnd: String(u.phone).slice(-4) });
}

export async function onRequestPost({ request, env }) {
  const [u, err] = await requireAdmin(env, request, { skip2fa: true });
  if (err) return err;
  const b = (await readJson(request)) || {};
  if (b.codeId) {
    const c = await checkCode(env, b.codeId, b.code, 'admin');
    if (!c.ok) return fail(c.error);
    if (JSON.parse(c.row.payload).userId !== u.id) return fail('Código inválido.');
    await env.DB.prepare('INSERT OR REPLACE INTO admin_2fa (token_hash, until) VALUES (?, ?)').bind(await sha256(getCookie(request, 'wl_s')), Date.now() + 12 * 3600000).run();
    return json({ ok: true });
  }
  if (!(await rateLimit(env, 'adm2fa:' + u.id, 6, 3600000))) return fail('Muitos códigos. Tente em 1 hora.', 429);
  const issued = await issueCode(env, u.phone, 'admin', { userId: u.id });
  return json(codeReply(issued, { phoneEnd: String(u.phone).slice(-4) }));
}
