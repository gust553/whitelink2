// Otimização automática (Diamante)
import { getUserSettings, loadPage } from './lib.js';
import { notify } from './crm.js';

// Teste A/B: com 100 cliques ou mais, se um título for 20% melhor, ele vira o oficial
export async function autoAB(env, uid, base, b) {
  const st = await getUserSettings(env, uid);
  if (!(st.auto && st.auto.ab)) return;
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const key = base + b.id;
  const r = await env.DB.prepare('SELECT block_id, SUM(n) AS n FROM clicks WHERE user_id = ? AND block_id IN (?, ?) AND day >= ? GROUP BY block_id').bind(uid, key, -key, from).all();
  let a = 0, z = 0;
  for (const x of r.results || []) { if (x.block_id === key) a = x.n; else z = x.n; }
  if (a + z < 100) return;
  const split = b.split || 50;
  const ra = a / split, rb = z / (100 - split);
  let winner = null;
  if (rb >= ra * 1.2) winner = b.titleB; else if (ra >= rb * 1.2) winner = b.title;
  if (!winner) return;
  const apply = (blocks) => blocks.map((x) => (x.id === b.id ? Object.assign({}, x, { title: winner, titleB: '' }) : x));
  if (base) {
    const pid = Math.round(base / 1000000);
    const row = await env.DB.prepare('SELECT blocks FROM pages WHERE id = ? AND user_id = ?').bind(pid, uid).first();
    if (!row) return;
    await env.DB.prepare('UPDATE pages SET blocks = ? WHERE id = ?').bind(JSON.stringify(apply(JSON.parse(row.blocks))), pid).run();
  } else {
    const pg = await loadPage(env, uid);
    await env.DB.prepare('UPDATE page_data SET blocks = ? WHERE user_id = ?').bind(JSON.stringify(apply(pg.blocks)), uid).run();
  }
  await notify(env, uid, 'otimizacao', 'Teste A/B terminou: "' + winner + '" ganhou e virou o título oficial.', '/painel');
}

// Ordem automática: os links com mais cliques nos últimos 30 dias sobem (fixados e destacados continuam no topo)
export async function autoOrder(env, uid, base, blocks) {
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const r = await env.DB.prepare('SELECT block_id, SUM(n) AS n FROM clicks WHERE user_id = ? AND day >= ? GROUP BY block_id').bind(uid, from).all();
  const c = {};
  for (const x of r.results || []) { const id = Math.abs(x.block_id) - base; c[id] = (c[id] || 0) + x.n; }
  const links = blocks.filter((b) => b.kind === 'link').sort((x, y) => (c[y.id] || 0) - (c[x.id] || 0));
  let i = 0;
  return blocks.map((b) => (b.kind === 'link' ? links[i++] : b));
}
