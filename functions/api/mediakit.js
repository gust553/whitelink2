import { json, fail, readJson, currentUser, effectivePlan, PLAN_LEVEL, cleanText, getUserSettings, setUserSettings, randomHex } from '../../src/lib.js';

// Mídia kit para marcas. Ouro: redes, preços e pedido de publi. Diamante: público, marcas, números e PDF.
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const ep = effectivePlan(u);
  const st = await getUserSettings(env, u.id);
  // propostas de publi recebidas pelo formulário do mídia kit (últimas 20)
  const pr = await env.DB.prepare("SELECT e.id, e.title, e.created_at, p.name, p.phone, p.id AS pid FROM events e LEFT JOIN people p ON p.id = e.person_id WHERE e.user_id = ? AND e.kind = 'publi' ORDER BY e.id DESC LIMIT 20").bind(u.id).all();
  return json({ ok: true, level: PLAN_LEVEL[ep.plan], agency: !!ep.agency, handle: u.handle, phone: u.phone, kit: st.mediakit || {}, report: st.report || '', proposals: pr.results || [] });
}

const num = (v) => Math.max(0, Math.min(1e10, parseInt(String(v || '').replace(/\D/g, ''), 10) || 0));

export async function onRequestPut({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const ep = effectivePlan(u), lvl = PLAN_LEVEL[ep.plan];
  if (lvl < 1) return fail('O mídia kit é do plano Ouro ou Diamante.', 403);
  const b = (await readJson(request, 60000)) || {};
  if (b.report !== undefined) {
    if (!ep.agency) return fail('O relatório para marcas é do plano Agência.', 403);
    await setUserSettings(env, u.id, { report: b.report ? randomHex(10) : '' });
    return json({ ok: true });
  }
  const k = b.kit || {};
  const NETS = ['instagram', 'tiktok', 'youtube', 'twitch', 'kwai', 'facebook', 'x', 'outro'];
  const kit = {
    headline: cleanText(k.headline, 90), about: cleanText(k.about, 600), niche: cleanText(k.niche, 80),
    photo: /^[a-f0-9]{24}$/.test(k.photo || '') ? k.photo : '',
    networks: (Array.isArray(k.networks) ? k.networks : []).slice(0, 8).map((n) => ({ net: NETS.includes(n.net) ? n.net : 'outro', handle: cleanText(n.handle, 60).replace(/^@/, ''), followers: num(n.followers), eng: Math.min(100, parseFloat(String(n.eng || 0).replace(',', '.')) || 0), views: num(n.views) })).filter((n) => n.handle || n.followers),
    prices: (Array.isArray(k.prices) ? k.prices : []).slice(0, 12).map((p) => ({ name: cleanText(p.name, 60), price: cleanText(p.price, 30), detail: cleanText(p.detail, 140) })).filter((p) => p.name),
    showPrices: k.showPrices !== false,
    email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(k.email || '').trim()) ? cleanText(k.email, 120) : '',
    wa: k.wa !== false,
    theme: k.theme === 'claro' ? 'claro' : 'escuro',
    accent: /^#[0-9a-f]{6}$/i.test(k.accent || '') ? k.accent.toLowerCase() : '#d4ff3a',
    // trabalhos anteriores (Ouro: 3, Diamante: 8)
    works: (Array.isArray(k.works) ? k.works : []).slice(0, lvl >= 2 ? 8 : 3).map((w) => ({ brand: cleanText(w.brand, 50), result: cleanText(w.result, 120), img: /^[a-f0-9]{24}$/.test(w.img || '') ? w.img : '', url: /^https?:\/\/\S+$/.test(String(w.url || '').trim()) ? String(w.url).trim().slice(0, 300) : '' })).filter((w) => w.brand || w.img),
    updated: Date.now()
  };
  if (k.email && !kit.email) return fail('E-mail de contato inválido.');
  if (lvl >= 2) {
    kit.audience = { women: Math.min(100, num(k.audience && k.audience.women)), ages: cleanText(k.audience && k.audience.ages, 80), cities: cleanText(k.audience && k.audience.cities, 160) };
    kit.brands = (Array.isArray(k.brands) ? k.brands : String(k.brands || '').split(',')).map((x) => cleanText(x, 40)).filter(Boolean).slice(0, 24);
    kit.showStats = k.showStats !== false;
  }
  await setUserSettings(env, u.id, { mediakit: kit });
  return json({ ok: true });
}
