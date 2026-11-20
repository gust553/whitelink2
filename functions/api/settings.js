import { json, fail, readJson, currentUser, ensureSchema, cleanText, effectivePlan, PLAN_LEVEL } from '../../src/lib.js';

// Configurações da página: SEO, Pixel, Analytics, domínio próprio
export async function onRequestGet({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const r = await env.DB.prepare('SELECT data FROM user_settings WHERE user_id = ?').bind(u.id).first();
  let d = {}; try { d = JSON.parse((r && r.data) || '{}'); } catch (e) {}
  return json({ ok: true, level: PLAN_LEVEL[effectivePlan(u).plan], handle: u.handle, settings: d });
}

export async function onRequestPut({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = (await readJson(request)) || {};
  const d = {
    seo: { title: cleanText(b.seo && b.seo.title, 70), desc: cleanText(b.seo && b.seo.desc, 160) },
    pixel: /^\d{6,20}$/.test(String(b.pixel || '').trim()) ? String(b.pixel).trim() : '',
    ga: /^G-[A-Z0-9]{4,15}$/i.test(String(b.ga || '').trim()) ? String(b.ga).trim().toUpperCase() : '',
    domain: /^[a-z0-9.-]{4,80}\.[a-z]{2,}$/i.test(String(b.domain || '').trim()) ? String(b.domain).trim().toLowerCase() : ''
  };
  await env.DB.prepare('INSERT INTO user_settings (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .bind(u.id, JSON.stringify(d), Date.now()).run();
  const bad = [];
  if (b.pixel && !d.pixel) bad.push('O ID do Pixel tem só números.');
  if (b.ga && !d.ga) bad.push('O ID do Google Analytics começa com G-.');
  return json({ ok: true, warnings: bad });
}
