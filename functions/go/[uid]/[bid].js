import { ensureSchema, loadPage } from '../../../src/lib.js';

// Conta o clique num bloco e manda o visitante para o destino
export async function onRequestGet({ env, params, waitUntil }) {
  await ensureSchema(env);
  const uid = Number(params.uid) || 0, bid = Number(params.bid) || 0;
  const page = await loadPage(env, uid);
  const b = page.blocks.find((x) => x.id === bid && x.on);
  if (!b || !/^https?:\/\//.test(b.url || '')) return Response.redirect('https://whitelink.site/', 302);
  const p = env.DB.prepare('INSERT INTO clicks (user_id, block_id, day, n) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, block_id, day) DO UPDATE SET n = n + 1')
    .bind(uid, bid, new Date().toISOString().slice(0, 10)).run();
  if (waitUntil) waitUntil(p); else await p;
  return Response.redirect(b.url, 302);
}
