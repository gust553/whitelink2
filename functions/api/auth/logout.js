import { getCookie, sha256, cookie } from '../../../src/lib.js';

export async function onRequestPost({ request, env }) {
  const t = getCookie(request, 'wl_s');
  if (t) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(t)).run();
  return new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'set-cookie': cookie('wl_s', '', 0) } });
}
