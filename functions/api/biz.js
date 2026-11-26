import { json, fail, readJson, currentUser, effectivePlan, PLAN_LEVEL, cleanText, cleanUrl, getUserSettings, setUserSettings, randomHex } from '../../src/lib.js';
import { agendaCfg, SERVICE_LIMIT, QUIZ_LIMIT } from '../../src/biz.js';

// Configurações de vendas do criador: loja, agenda, apoio e quizzes
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const st = await getUserSettings(env, u.id);
  const products = await env.DB.prepare('SELECT id, name, cents, image, descr, active, stock, position FROM products WHERE user_id = ? ORDER BY position, id').bind(u.id).all();
  const goal = await supportTotals(env, u.id, st);
  const ep = effectivePlan(u);
  return json({
    ok: true, level: PLAN_LEVEL[ep.plan], agency: !!ep.agency, handle: u.handle, phone: u.phone,
    pay: st.pay || {}, shop: st.shop || { shipping: 0, coupons: [] }, agenda: agendaCfg(st),
    support: Object.assign({ title: 'Me ajude a chegar na meta', cents: 50000, on: true }, st.support || {}, { raised: goal.raised, count: goal.count }),
    quizzes: st.quizzes || [], products: products.results || []
  });
}

export async function supportTotals(env, userId, st) {
  const since = (st.support && st.support.since) || 0;
  const r = await env.DB.prepare("SELECT COALESCE(SUM(cents),0) AS c, COUNT(*) AS n FROM sales WHERE user_id = ? AND kind = 'apoio' AND status = 'pago' AND created_at >= ?").bind(userId, since).first();
  return { raised: r.c, count: r.n };
}

const cents = (v, max = 10000000) => { const c = Math.round(parseFloat(String(v).replace(/\./g, '').replace(',', '.')) * 100); return c >= 0 && c <= max ? c : NaN; };

export async function onRequestPut({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const lvl = PLAN_LEVEL[effectivePlan(u).plan];
  if (lvl < 1) return fail('Vendas pela bio são do plano Ouro ou Diamante.', 403);
  const b = (await readJson(request, 200000)) || {};
  const patch = {};
  if (b.shop) {
    const ship = cents(b.shop.shipping || 0);
    patch.shop = {
      shipping: lvl >= 2 && ship >= 0 ? ship : 0,
      coupons: lvl >= 2 ? (Array.isArray(b.shop.coupons) ? b.shop.coupons : []).slice(0, 30).map((c) => ({ code: String(c.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20), pct: Math.max(1, Math.min(90, parseInt(c.pct, 10) || 10)) })).filter((c) => c.code) : [],
      note: cleanText(b.shop.note, 200)
    };
  }
  if (b.agenda) {
    const a = b.agenda;
    const services = (Array.isArray(a.services) ? a.services : []).slice(0, SERVICE_LIMIT[lvl]).map((s) => ({
      id: /^[a-f0-9]{8}$/.test(s.id || '') ? s.id : randomHex(4), name: cleanText(s.name, 60) || 'Atendimento',
      minutes: Math.max(10, Math.min(600, parseInt(s.minutes, 10) || 60)), cents: cents(s.price || 0) || 0,
      deposit: lvl >= 2 ? (cents(s.deposit || 0) || 0) : 0
    }));
    patch.agenda = Object.assign(agendaCfg({ agenda: a }), { services, blocked: lvl >= 2 ? agendaCfg({ agenda: a }).blocked.filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)) : [] });
  }
  if (b.support) {
    const s = b.support, old = (await getUserSettings(env, u.id)).support || {};
    patch.support = { title: cleanText(s.title, 80) || 'Me ajude a chegar na meta', cents: cents(s.goal) || 50000, on: s.on !== false,
      since: s.reset ? Date.now() : (old.since || 0), ranking: lvl >= 2 && s.ranking !== false, messages: lvl >= 2 && s.messages !== false };
  }
  if (b.quizzes) {
    patch.quizzes = (Array.isArray(b.quizzes) ? b.quizzes : []).slice(0, QUIZ_LIMIT[lvl]).map((q) => {
      const results = (Array.isArray(q.results) ? q.results : []).slice(0, 8).map((r) => ({ title: cleanText(r.title, 80), text: cleanText(r.text, 400), btn: cleanText(r.btn, 40), url: cleanUrl(r.url || '') || '' }));
      return {
        id: /^[a-f0-9]{8}$/.test(q.id || '') ? q.id : randomHex(4), title: cleanText(q.title, 80) || 'Quiz', intro: cleanText(q.intro, 200),
        askContact: q.askContact !== false,
        questions: (Array.isArray(q.questions) ? q.questions : []).slice(0, 15).map((x) => ({ q: cleanText(x.q, 160), options: (Array.isArray(x.options) ? x.options : []).slice(0, 6).map((o) => ({ t: cleanText(o.t, 80), r: Math.max(0, Math.min(results.length - 1, parseInt(o.r, 10) || 0)) })) })),
        results
      };
    });
  }
  await setUserSettings(env, u.id, patch);
  return json({ ok: true });
}
