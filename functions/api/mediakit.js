import { json, fail, readJson, currentUser, effectivePlan, PLAN_LEVEL, cleanText, getUserSettings, setUserSettings, randomHex } from '../../src/lib.js';

// Mídia kit para marcas. Ouro: redes, preços e pedido de publi. Diamante: público, marcas, números e PDF.
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const ep = effectivePlan(u);
  const st = await getUserSettings(env, u.id);
  return json({ ok: true, level: PLAN_LEVEL[ep.plan], agency: !!ep.agency, handle: u.handle, kit: st.mediakit || {}, report: st.report || '' });
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
    prices: (Array.isArray(k.prices) ? k.prices : []).slice(0, 12).map((p) => ({ name: cleanText(p.name, 60), price: cleanText(p.price, 30) })).filter((p) => p.name),
    email: cleanText(k.email, 120)
  };
  if (lvl >= 2) {
    kit.audience = { women: Math.min(100, num(k.audience && k.audience.women)), ages: cleanText(k.audience && k.audience.ages, 80), cities: cleanText(k.audience && k.audience.cities, 160) };
    kit.brands = (Array.isArray(k.brands) ? k.brands : String(k.brands || '').split(',')).map((x) => cleanText(x, 40)).filter(Boolean).slice(0, 24);
    kit.showStats = k.showStats !== false;
  }
  await setUserSettings(env, u.id, { mediakit: kit });
  return json({ ok: true });
}
