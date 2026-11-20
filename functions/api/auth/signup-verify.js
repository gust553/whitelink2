import { json, fail, readJson, checkCode, createSession, sha256, randomHex, getCookie, cookie,
  rateLimit, clientIp, DAY, TRIAL_DAYS } from '../../../src/lib.js';

// Passo 2 do cadastro: confere o código, cria a conta e decide se ganha o teste Diamante
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  if (!b) return fail('Dados inválidos.');
  if (!(await rateLimit(env, 'verify-ip:' + clientIp(request), 30, 3600000))) return fail('Muitas tentativas. Tente mais tarde.', 429);
  const c = await checkCode(env, b.codeId, b.code, 'signup');
  if (!c.ok) return fail(c.error);
  const p = JSON.parse(c.row.payload);

  const dup = await env.DB.prepare('SELECT id FROM users WHERE email = ? OR phone = ? OR handle = ?').bind(p.email, p.phone, p.handle).first();
  if (dup) return fail('Esses dados acabaram de ser usados em outra conta. Comece de novo.');

  // Antifraude: um teste por e-mail, celular, Instagram e aparelho
  let device = getCookie(request, 'wl_d');
  const newDevice = !device || device.length !== 32;
  if (newDevice) device = randomHex(16);
  const keys = [['email', p.email], ['phone', p.phone], ['instagram', p.instagram], ['device', device]];
  const hashes = [];
  for (const [k, v] of keys) hashes.push([k, await sha256(k + ':' + v)]);
  let used = false;
  for (const [k, h] of hashes) {
    const r = await env.DB.prepare('SELECT 1 AS x FROM trial_registry WHERE kind = ? AND value_hash = ?').bind(k, h).first();
    if (r) { used = true; break; }
  }
  const now = Date.now();
  let trialUntil = used ? null : now + TRIAL_DAYS * DAY;

  let referredBy = null;
  if (p.ref) {
    const r = await env.DB.prepare('SELECT id FROM users WHERE ref_code = ?').bind(p.ref).first();
    if (r) referredBy = r.id;
  }
  // amigo indicado ganha +7 dias no teste (só quem ainda tem direito ao teste)
  if (referredBy && trialUntil) trialUntil += 7 * DAY;
  const refCode = (p.handle.replace(/[^a-z0-9]/g, '').slice(0, 8) + randomHex(2)).toUpperCase();

  const res = await env.DB.prepare(
    `INSERT INTO users (email, phone, pass_hash, pass_salt, name, instagram, handle, plan, trial_until, ref_code, referred_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'prata', ?, ?, ?, ?)`
  ).bind(p.email, p.phone, p.hash, p.salt, p.name, p.instagram, p.handle, trialUntil, refCode, referredBy, now).run();
  const userId = res.meta.last_row_id;

  await env.DB.prepare('INSERT INTO profiles (user_id, title, bio, theme, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, p.name, '', 'noite', now).run();
  if (!used) {
    for (const [k, h] of hashes) {
      await env.DB.prepare('INSERT OR IGNORE INTO trial_registry (kind, value_hash, created_at) VALUES (?, ?, ?)').bind(k, h, now).run();
    }
  }

  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  headers.append('set-cookie', await createSession(env, request, userId));
  if (newDevice) headers.append('set-cookie', cookie('wl_d', device, 5 * 365 * 86400));
  return new Response(JSON.stringify({ ok: true, trial: !used }), { headers });
}
