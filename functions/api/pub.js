import { json, fail, readJson, effectivePlan, PLAN_LEVEL, cleanText, rateLimit, clientIp, getCookie, getUserSettings } from '../../src/lib.js';
import { track, notify } from '../../src/crm.js';
import { agendaCfg, freeSlots, creatorPix, creatorWa, waLink, newCode, dayOf, brl } from '../../src/biz.js';

// Ações de quem visita a página do criador: comprar, agendar, apoiar, responder quiz.
// /api/pub/order | slots | book | support | quiz | goal
async function owner(env, h) {
  h = String(h || '').toLowerCase();
  let u = await env.DB.prepare("SELECT * FROM users WHERE handle = ? AND status = 'ativo'").bind(h).first();
  if (!u) u = await env.DB.prepare("SELECT u.* FROM pages p JOIN users u ON u.id = p.user_id WHERE p.handle = ? AND u.status = 'ativo'").bind(h).first();
  if (!u) return null;
  return { u, lvl: PLAN_LEVEL[effectivePlan(u).plan], st: await getUserSettings(env, u.id) };
}
const phoneOk = (p) => { p = String(p || '').replace(/\D/g, ''); if (p.startsWith('55') && p.length >= 12) p = p.slice(2); return p.length >= 10 && p.length <= 11 ? p : ''; };
const affOf = (request, uid) => String(getCookie(request, 'wl_a' + uid) || '').replace(/[^a-z0-9]/gi, '').slice(0, 20);
const fmtPhone = (p) => '(' + p.slice(0, 2) + ') ' + p.slice(2, -4) + '-' + p.slice(-4);

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const o = await owner(env, url.searchParams.get('h'));
  if (!o) return fail('Página não encontrada.', 404);
  if (params.action === 'slots') {
    const cfg = agendaCfg(o.st);
    const svc = cfg.services.find((x) => x.id === url.searchParams.get('s'));
    const day = /^\d{4}-\d\d-\d\d$/.test(url.searchParams.get('d') || '') ? url.searchParams.get('d') : '';
    if (!svc || !day || o.lvl < 1) return json({ ok: true, slots: [] });
    return json({ ok: true, slots: await freeSlots(env, o.u.id, cfg, svc, day) });
  }
  if (params.action === 'goal') return json({ ok: true, goal: await goalView(env, o) });
  return fail('Não encontrado.', 404);
}

export async function goalView(env, o) {
  const s = Object.assign({ title: 'Me ajude a chegar na meta', cents: 50000, on: true }, o.st.support || {});
  const since = s.since || 0;
  const t = await env.DB.prepare("SELECT COALESCE(SUM(cents),0) AS c, COUNT(*) AS n FROM sales WHERE user_id = ? AND kind = 'apoio' AND status = 'pago' AND created_at >= ?").bind(o.u.id, since).first();
  const out = { title: s.title, goal: s.cents, goalLabel: brl(s.cents), raised: t.c, raisedLabel: brl(t.c), count: t.n, pct: Math.min(100, Math.round(t.c / Math.max(1, s.cents) * 100)) };
  if (o.lvl >= 2 && s.ranking !== false) {
    const r = await env.DB.prepare("SELECT name, SUM(cents) AS c FROM sales WHERE user_id = ? AND kind = 'apoio' AND status = 'pago' AND created_at >= ? GROUP BY LOWER(name) ORDER BY c DESC LIMIT 5").bind(o.u.id, since).all();
    out.ranking = (r.results || []).map((x) => ({ name: String(x.name || 'Anônimo').split(' ')[0], value: brl(x.c) }));
  }
  if (o.lvl >= 2 && s.messages !== false) {
    const r = await env.DB.prepare("SELECT name, cents, message FROM sales WHERE user_id = ? AND kind = 'apoio' AND status = 'pago' AND message <> '' ORDER BY id DESC LIMIT 6").bind(o.u.id).all();
    out.messages = (r.results || []).map((x) => ({ name: String(x.name || 'Anônimo').split(' ')[0], value: brl(x.cents), text: x.message }));
  }
  return out;
}

export async function onRequestPost({ request, env, params }) {
  const b = (await readJson(request)) || {};
  const o = await owner(env, b.h);
  if (!o) return fail('Página não encontrada.', 404);
  if (!(await rateLimit(env, 'pub:' + clientIp(request), 30, 3600000))) return fail('Muitas tentativas. Tente mais tarde.', 429);
  const { u, lvl, st } = o;
  if (lvl < 1) return fail('Esta função não está disponível nesta página.', 403);
  const name = cleanText(b.name, 60);
  const phone = phoneOk(b.phone);
  const aff = affOf(request, u.id);
  const wa = creatorWa(st, u);

  if (params.action === 'order') {
    if (!name || !phone) return fail('Escreva seu nome e WhatsApp com DDD.');
    const want = (Array.isArray(b.items) ? b.items : []).slice(0, 50).map((x) => ({ id: parseInt(x.id, 10) || 0, qty: Math.max(1, Math.min(99, parseInt(x.qty, 10) || 1)) }));
    if (!want.length) return fail('Seu carrinho está vazio.');
    const rows = (await env.DB.prepare(`SELECT id, name, cents, stock FROM products WHERE user_id = ? AND active = 1 AND id IN (${want.map(() => '?').join(',')})`).bind(u.id, ...want.map((x) => x.id)).all()).results || [];
    const items = [];
    for (const w of want) {
      const p = rows.find((r) => r.id === w.id);
      if (!p) continue;
      if (p.stock >= 0 && p.stock < w.qty) return fail('Só temos ' + p.stock + ' de "' + p.name + '".');
      items.push({ id: p.id, name: p.name, qty: w.qty, cents: p.cents });
    }
    if (!items.length) return fail('Esses produtos não estão mais disponíveis.');
    let total = items.reduce((a, x) => a + x.cents * x.qty, 0);
    const shop = st.shop || {};
    let coupon = '';
    if (lvl >= 2 && b.coupon) {
      const c = (shop.coupons || []).find((x) => x.code === String(b.coupon).toUpperCase().trim());
      if (!c) return fail('Cupom inválido.');
      coupon = c.code + ' (-' + c.pct + '%)'; total = Math.round(total * (100 - c.pct) / 100);
    }
    const ship = lvl >= 2 ? (shop.shipping || 0) : 0;
    total += ship;
    const code = newCode('P');
    const note = cleanText(b.note, 200);
    const t = await track(env, u.id, { phone, name, kind: 'pedido', title: 'Pedido ' + code + ' · ' + brl(total), cents: 0, ref: code, aff });
    await env.DB.prepare("INSERT INTO sales (user_id, kind, code, person_id, name, phone, items, cents, status, message, aff, created_at) VALUES (?, 'pedido', ?, ?, ?, ?, ?, ?, 'aguardando', ?, ?, ?)")
      .bind(u.id, code, t.personId, name, phone, JSON.stringify({ items, coupon, ship }), total, note, aff || null, Date.now()).run();
    for (const it of items) await env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= 0').bind(it.qty, it.id).run();
    await notify(env, u.id, 'pedido', 'Novo pedido ' + code + ' de ' + name + ': ' + brl(total), '/painel/vendas');
    const lines = items.map((x) => x.qty + 'x ' + x.name + ' — ' + brl(x.cents * x.qty)).join('\n');
    const pix = lvl >= 2 ? creatorPix(st, total, code) : '';
    const msg = 'Olá! Fiz o pedido ' + code + ' pela sua página:\n' + lines + (coupon ? '\nCupom: ' + coupon : '') + (ship ? '\nFrete: ' + brl(ship) : '') + '\nTotal: ' + brl(total) + '\nNome: ' + name + (note ? '\nObs.: ' + note : '') + (pix ? '\n\nJá vou pagar pelo Pix.' : '');
    return json({ ok: true, code, total: brl(total), pix, wa: wa ? waLink(wa, msg) : '' });
  }

  if (params.action === 'book') {
    if (!name || !phone) return fail('Escreva seu nome e WhatsApp com DDD.');
    const cfg = agendaCfg(st);
    const svc = cfg.services.find((x) => x.id === b.service);
    const ts = parseInt(b.ts, 10) || 0;
    if (!svc || !ts) return fail('Escolha o serviço e o horário.');
    const free = await freeSlots(env, u.id, cfg, svc, dayOf(ts));
    if (!free.some((x) => x.ts === ts)) return fail('Esse horário acabou de ser ocupado. Escolha outro.');
    const code = newCode('A');
    const when = new Date(ts - 3 * 3600000).toISOString();
    const label = when.slice(8, 10) + '/' + when.slice(5, 7) + ' às ' + when.slice(11, 16);
    const deposit = lvl >= 2 ? svc.deposit || 0 : 0;
    const t = await track(env, u.id, { phone, name, kind: 'agendamento', title: svc.name + ' · ' + label, ref: code, aff });
    await env.DB.prepare("INSERT INTO sales (user_id, kind, code, person_id, name, phone, cents, status, start_ts, service, message, aff, created_at) VALUES (?, 'agendamento', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(u.id, code, t.personId, name, phone, svc.cents, deposit ? 'aguardando' : 'confirmado', ts, svc.id, cleanText(b.note, 200), aff || null, Date.now()).run();
    await notify(env, u.id, 'agendamento', 'Novo agendamento: ' + name + ' · ' + svc.name + ' · ' + label, '/painel/vendas');
    const pix = deposit ? creatorPix(st, deposit, code) : '';
    const msg = 'Olá! Agendei ' + svc.name + ' para ' + label + ' pela sua página (código ' + code + '). Nome: ' + name + '.' + (deposit ? ' Vou pagar o sinal de ' + brl(deposit) + ' pelo Pix.' : '');
    return json({ ok: true, code, label, service: svc.name, deposit: deposit ? brl(deposit) : '', pix, wa: wa ? waLink(wa, msg) : '' });
  }

  if (params.action === 'support') {
    const c = Math.round(parseFloat(String(b.value || '').replace(',', '.')) * 100);
    if (!(c >= 100 && c <= 1000000)) return fail('Escolha um valor a partir de R$ 1,00.');
    if (!(st.pay && st.pay.key)) return fail('Esta página ainda não está recebendo apoios.');
    const code = newCode('D');
    const msg = lvl >= 2 ? cleanText(b.message, 140) : '';
    const t = phone ? await track(env, u.id, { phone, name, kind: 'apoio', title: 'Apoio ' + brl(c), ref: code, aff }) : { personId: null };
    await env.DB.prepare("INSERT INTO sales (user_id, kind, code, person_id, name, phone, cents, status, message, aff, created_at) VALUES (?, 'apoio', ?, ?, ?, ?, ?, 'aguardando', ?, ?, ?)")
      .bind(u.id, code, t.personId, name || 'Anônimo', phone, c, msg, aff || null, Date.now()).run();
    await notify(env, u.id, 'apoio', 'Novo apoio de ' + (name || 'Anônimo') + ': ' + brl(c) + ' (confira o Pix)', '/painel/vendas');
    return json({ ok: true, code, value: brl(c), pix: creatorPix(st, c, code) });
  }

  if (params.action === 'quiz') {
    const q = (st.quizzes || []).find((x) => x.id === b.quiz);
    if (!q || !q.results.length) return fail('Quiz não encontrado.');
    const score = q.results.map(() => 0);
    (Array.isArray(b.answers) ? b.answers : []).forEach((a, i) => { const opt = q.questions[i] && q.questions[i].options[parseInt(a, 10)]; if (opt) score[opt.r]++; });
    const best = score.indexOf(Math.max(...score));
    const res = q.results[best];
    if (q.askContact && !phone) return fail('Escreva seu WhatsApp para ver o resultado.');
    if (phone) {
      await track(env, u.id, { phone, name, kind: 'quiz', title: q.title + ' → ' + res.title, aff });
      await notify(env, u.id, 'contato', 'Quiz "' + q.title + '": ' + (name || fmtPhone(phone)) + ' → ' + res.title, '/painel/clientes');
    }
    return json({ ok: true, result: res });
  }
  return fail('Não encontrado.', 404);
}
