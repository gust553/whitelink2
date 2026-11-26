import { ensureSchema, loadPage, parsePageRow, effectivePlan, PLAN_LEVEL } from '../../../src/lib.js';
import { ruleUrl, openInApp } from '../../../src/smart.js';

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
  const owner = await env.DB.prepare('SELECT plan, plan_until, trial_until FROM users WHERE id = ?').bind(uid).first();
  const lvl = owner ? PLAN_LEVEL[effectivePlan(owner).plan] : 0;
  const ua = request.headers.get('user-agent') || '';
  const dest = lvl >= 2 ? ruleUrl(b, ua) : b.url;
  // clique veio de alguém indicado por um parceiro
  const ck = (request.headers.get('cookie') || '').match(new RegExp('(?:^|; )wl_a' + uid + '=([a-z0-9]+)'));
  if (ck) { const q = env.DB.prepare('INSERT INTO aff_stats (user_id, code, day, visits, clicks) VALUES (?, ?, ?, 0, 1) ON CONFLICT(user_id, code, day) DO UPDATE SET clicks = clicks + 1').bind(uid, ck[1], new Date().toISOString().slice(0, 10)).run(); if (waitUntil) waitUntil(q); else await q; }
  if (lvl >= 2 && b.titleB) { try { const { autoAB } = await import('../../../src/auto.js'); const q = autoAB(env, uid, base, b); if (waitUntil) waitUntil(q); else await q; } catch (e) {} }
  return (lvl >= 1 && openInApp(dest, ua)) || Response.redirect(dest, 302);
}
