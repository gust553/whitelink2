import { json, fail, readJson, currentUser, cleanText, effectivePlan, PLAN_LEVEL, getUserSettings, setUserSettings, loadPage } from '../../src/lib.js';

// Configurações da conta: Google, Pixel, Analytics, recebimentos por Pix, otimização e prova social.
// Só mexe no que vier na requisição; o resto continua como estava.
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const ep = effectivePlan(u);
  return json({ ok: true, level: PLAN_LEVEL[ep.plan], agency: !!ep.agency, handle: u.handle, avatar: (await loadPage(env, u.id)).appearance.avatar || '', settings: await getUserSettings(env, u.id) });
}

export async function onRequestPut({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = (await readJson(request)) || {};
  const patch = {}, bad = [];
  if (b.seo !== undefined) patch.seo = { title: cleanText(b.seo && b.seo.title, 70), desc: cleanText(b.seo && b.seo.desc, 160) };
  if (b.pixel !== undefined) { patch.pixel = /^\d{6,20}$/.test(String(b.pixel || '').trim()) ? String(b.pixel).trim() : ''; if (b.pixel && !patch.pixel) bad.push('O ID do Pixel tem só números.'); }
  if (b.ga !== undefined) { patch.ga = /^G-[A-Z0-9]{4,15}$/i.test(String(b.ga || '').trim()) ? String(b.ga).trim().toUpperCase() : ''; if (b.ga && !patch.ga) bad.push('O ID do Google Analytics começa com G-.'); }
  if (b.pay !== undefined) {
    const k = String((b.pay && b.pay.key) || '').trim().slice(0, 77);
    patch.pay = { key: k, name: cleanText(b.pay && b.pay.name, 25), city: cleanText(b.pay && b.pay.city, 15), wa: String((b.pay && b.pay.wa) || '').replace(/\D/g, '').slice(0, 13) };
    if (k && k.length < 8) bad.push('Chave Pix muito curta.');
  }
  if (b.auto !== undefined) patch.auto = { ab: !!(b.auto && b.auto.ab), order: !!(b.auto && b.auto.order) };
  if (b.live !== undefined) patch.live = { viewers: !!(b.live && b.live.viewers), sales: !!(b.live && b.live.sales) };
  await setUserSettings(env, u.id, patch);
  return json({ ok: true, warnings: bad });
}
