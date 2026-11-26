import { ensureSchema, loadPage, parsePageRow } from '../../../src/lib.js';

// Conta o clique num bloco e manda o visitante para o destino.
// /go/12/3 = página principal do cliente 12, bloco 3. /go/x5/3 = página extra 5. ?v=b = título B do teste A/B.
export async function onRequestGet({ request, env, params, waitUntil }) {
  await ensureSchema(env);
  const raw = String(params.uid || ''), bid = Number(params.bid) || 0;
  let uid = 0, blocks = [], base = 0;
  if (raw[0] === 'x') {
    const pid = Number(raw.slice(1)) || 0;
    const r = await env.DB.prepare('SELECT * FROM pages WHERE id = ?').bind(pid).first();
    if (r) { uid = r.user_id; blocks = parsePageRow(r).blocks; base = pid * 1000000; }
  } else {
    uid = Number(raw) || 0;
    blocks = (await loadPage(env, uid)).blocks;
  }
  const b = blocks.find((x) => x.id === bid && x.on);
  if (!b || !/^https?:\/\//.test(b.url || '')) return Response.redirect('https://whitelink.site/', 302);
  const isB = new URL(request.url).searchParams.get('v') === 'b';
  const key = (base + bid) * (isB ? -1 : 1);
  const p = env.DB.prepare('INSERT INTO clicks (user_id, block_id, day, n) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, block_id, day) DO UPDATE SET n = n + 1')
    .bind(uid, key, new Date().toISOString().slice(0, 10)).run();
  if (waitUntil) waitUntil(p); else await p;
  return Response.redirect(b.url, 302);
}
