import { json, fail, currentUser, ensureSchema, effectivePlan, PLAN_LEVEL, loadPage } from '../../src/lib.js';

export async function statsData(env, u, days) {
  const lvl = PLAN_LEVEL[effectivePlan(u).plan];
  const maxDays = [7, 30, 90][lvl];
  const n = Math.min(maxDays, [7, 30, 90].includes(days) ? days : 7);
  const from = new Date(Date.now() - (n - 1) * 86400000).toISOString().slice(0, 10);
  const v = await env.DB.prepare('SELECT day, views FROM visits WHERE user_id = ? AND day >= ? ORDER BY day').bind(u.id, from).all();
  const map = Object.fromEntries((v.results || []).map((r) => [r.day, r.views]));
  const series = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); series.push({ day: d, views: map[d] || 0 }); }
  const visits = series.reduce((a, b) => a + b.views, 0);
  const out = { ok: true, level: lvl, days: n, maxDays, visits, series };
  if (lvl >= 1) {
    const c = await env.DB.prepare('SELECT block_id, SUM(n) AS n FROM clicks WHERE user_id = ? AND day >= ? GROUP BY block_id').bind(u.id, from).all();
    const page = await loadPage(env, u.id);
    const byId = {};
    for (const r of c.results || []) byId[r.block_id] = r.n;
    out.clicks = Object.values(byId).reduce((a, b) => a + b, 0);
    out.links = page.blocks.filter((b) => ['link', 'shop', 'video', 'gallery'].includes(b.kind)).map((b) => ({ id: b.id, title: b.title, clicks: byId[b.id] || 0, clicksB: byId[-b.id] || 0, titleB: b.titleB || '' }))
      .sort((a, b) => b.clicks - a.clicks);
    const m = await env.DB.prepare('SELECT kind, key, SUM(n) AS n FROM visit_meta WHERE user_id = ? AND day >= ? GROUP BY kind, key ORDER BY n DESC').bind(u.id, from).all();
    const g = { src: [], dev: [], city: [] };
    for (const r of m.results || []) if (g[r.kind] && g[r.kind].length < 6) g[r.kind].push({ k: r.key, n: r.n });
    out.breakdown = g;
    if (lvl >= 2) {
      // horários de pico (Diamante)
      const hours = Array(24).fill(0), dows = Array(7).fill(0);
      for (const r of m.results || []) { if (r.kind === 'hour') hours[+r.key] += r.n; if (r.kind === 'dow') dows[+r.key] += r.n; }
      out.hours = hours; out.dows = dows;
      const cl = await env.DB.prepare('SELECT l.id, l.slug, l.name, COALESCE((SELECT SUM(n) FROM camp_clicks c WHERE c.link_id = l.id AND c.day >= ?), 0) AS n FROM camp_links l WHERE l.user_id = ? ORDER BY n DESC LIMIT 10').bind(from, u.id).all();
      out.campaigns = cl.results || [];
    }
    const ct = await env.DB.prepare('SELECT COUNT(*) AS n FROM contacts WHERE user_id = ? AND created_at >= ?').bind(u.id, Date.parse(from)).first();
    out.contacts = ct.n;
  }
  return out;
}

export async function onRequestGet({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const days = parseInt(new URL(request.url).searchParams.get('d'), 10) || 7;
  return json(await statsData(env, u, days));
}
