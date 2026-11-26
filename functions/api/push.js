import { json, fail, readJson, currentUser } from '../../src/lib.js';
import { vapidKeys, sendPush } from '../../src/push.js';

// Ativar/desativar avisos no celular
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?').bind(u.id).first()).n;
  return json({ ok: true, key: (await vapidKeys(env)).pub, devices: n });
}

export async function onRequestPost({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = (await readJson(request)) || {};
  if (b.test) {
    const subs = (await env.DB.prepare('SELECT * FROM push_subs WHERE user_id = ?').bind(u.id).all()).results || [];
    let sent = 0;
    for (const s of subs) { try { const st = await sendPush(env, s, { title: 'WhiteLink', body: 'Tudo certo! Os avisos vão chegar aqui. 🎉', url: '/painel' }); if (st < 300) sent++; } catch (e) {} }
    return json({ ok: true, sent });
  }
  const s = b.subscription || {};
  if (!/^https:\/\//.test(s.endpoint || '') || !s.keys || !s.keys.p256dh || !s.keys.auth) return fail('Inscrição inválida.');
  await env.DB.prepare('INSERT INTO push_subs (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth')
    .bind(String(s.endpoint).slice(0, 600), u.id, String(s.keys.p256dh).slice(0, 200), String(s.keys.auth).slice(0, 60), Date.now()).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  await env.DB.prepare('DELETE FROM push_subs WHERE user_id = ?').bind(u.id).run();
  return json({ ok: true });
}
