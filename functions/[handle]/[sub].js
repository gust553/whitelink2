import { escapeHtml as e, effectivePlan, PLAN_LEVEL, getUserSettings, loadPage, RESERVED } from '../../src/lib.js';
import { affReport } from '../api/affiliates.js';

// Páginas extras de cada criador:
// /nome/midiakit  — mídia kit para marcas
// /nome/relatorio?k=…  — relatório para marcas (Agência)
// /nome/parceiro?c=…&k=…  — números do parceiro (afiliado)
// /nome/<link de campanha> — links de campanha (links inteligentes)
export async function onRequestGet(context) {
  const { env, params, request, next } = context;
  const h = String(params.handle || '').toLowerCase(), sub = String(params.sub || '').toLowerCase();
  if (RESERVED.has(h) || /\./.test(sub)) return next();
  const u = await env.DB.prepare("SELECT * FROM users WHERE handle = ? AND status = 'ativo'").bind(h).first();
  if (!u) return next();
  const ep = effectivePlan(u), lvl = PLAN_LEVEL[ep.plan];
  const st = await getUserSettings(env, u.id);
  const url = new URL(request.url);
  if (sub === 'midiakit') return lvl >= 1 && st.mediakit ? mediakit(env, u, lvl, st) : page('Mídia kit', '<h1>Mídia kit indisponível</h1><p class="m">Esta página ainda não publicou o mídia kit.</p>', 404);
  if (sub === 'relatorio') {
    if (!ep.agency || !st.report || url.searchParams.get('k') !== st.report) return page('Relatório', '<h1>Relatório indisponível</h1>', 404);
    return report(env, u);
  }
  if (sub === 'parceiro') {
    const a = await env.DB.prepare('SELECT * FROM affiliates WHERE user_id = ? AND code = ?').bind(u.id, String(url.searchParams.get('c') || '')).first();
    if (!a || lvl < 2 || url.searchParams.get('k') !== a.token) return page('Parceiro', '<h1>Link inválido</h1>', 404);
    const r = await affReport(env, u.id, a.code, 30);
    const link = 'https://whitelink.site/' + u.handle + '?a=' + a.code;
    return page('Seus números', `<p class="m">Parceiro de <b>@${e(u.handle)}</b></p><h1>Olá, ${e(a.name.split(' ')[0])}!</h1>
      <div class="card"><div class="m">Seu link para divulgar</div><code>${e(link)}</code><button onclick="navigator.clipboard.writeText('${e(link)}');this.textContent='Copiado ✓'">Copiar link</button></div>
      <div class="kp">${kpi(r.visits, 'visitas')}${kpi(r.clicks, 'cliques')}${kpi(r.leads, 'contatos')}${kpi(r.sales, 'vendas')}</div>
      <div class="card"><div class="m">Vendas pagas (30 dias)</div><b class="big">${brl(r.cents)}</b><div class="m">Sua comissão (${a.pct}%): <b>${brl(Math.round(r.cents * a.pct / 100))}</b></div></div>
      <p class="m">Os números atualizam na hora. A comissão é paga diretamente por @${e(u.handle)}.</p>`);
  }
  // link de campanha (links inteligentes)
  try { const { campaignLink } = await import('../../src/smart.js'); const r = await campaignLink(context, u, lvl, st, sub); if (r) return r; } catch (x) {}
  return next();
}

const brl = (c) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const kpi = (v, l) => `<div class="k"><b>${typeof v === 'number' ? v.toLocaleString('pt-BR') : v}</b><span>${l}</span></div>`;
const short = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + ' mi' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '').replace('.', ',') + ' mil' : String(n);
const NET = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', twitch: 'Twitch', kwai: 'Kwai', facebook: 'Facebook', x: 'X', outro: 'Outra rede' };

async function stats(env, uid, days) {
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const v = await env.DB.prepare('SELECT COALESCE(SUM(views),0) AS n FROM visits WHERE user_id = ? AND day >= ?').bind(uid, from).first();
  const c = await env.DB.prepare('SELECT COALESCE(SUM(n),0) AS n FROM clicks WHERE user_id = ? AND day >= ?').bind(uid, from).first();
  const src = await env.DB.prepare("SELECT key, SUM(n) AS n FROM visit_meta WHERE user_id = ? AND day >= ? AND kind = 'src' GROUP BY key ORDER BY n DESC LIMIT 5").bind(uid, from).all();
  const city = await env.DB.prepare("SELECT key, SUM(n) AS n FROM visit_meta WHERE user_id = ? AND day >= ? AND kind = 'city' GROUP BY key ORDER BY n DESC LIMIT 5").bind(uid, from).all();
  return { visits: v.n, clicks: c.n, src: src.results || [], city: city.results || [] };
}

async function mediakit(env, u, lvl, st) {
  const k = st.mediakit;
  const total = (k.networks || []).reduce((a, n) => a + n.followers, 0);
  const s = lvl >= 2 && k.showStats !== false ? await stats(env, u.id, 30) : null;
  const photo = k.photo ? `<img class="ph" src="/m/${k.photo}" alt="">` : '';
  const body = `${photo}<p class="m">${e(k.niche || 'Criador de conteúdo')}</p><h1>${e(k.headline || u.name)}</h1>
    ${k.about ? `<p>${e(k.about)}</p>` : ''}
    <div class="kp">${kpi(short(total), 'seguidores no total')}${(k.networks || []).length ? kpi((k.networks || []).length, 'redes') : ''}${s ? kpi(short(s.visits), 'visitas na página (30 dias)') + kpi(short(s.clicks), 'cliques (30 dias)') : ''}</div>
    <h2>Redes</h2><div class="list">${(k.networks || []).map((n) => `<div class="row"><span><b>${NET[n.net]}</b><br><span class="m">@${e(n.handle)}</span></span><span style="text-align:right"><b>${short(n.followers)}</b> seguidores${n.eng ? `<br><span class="m">${String(n.eng).replace('.', ',')}% engajamento</span>` : ''}${n.views ? `<br><span class="m">${short(n.views)} views médias</span>` : ''}</span></div>`).join('')}</div>
    ${lvl >= 2 && k.audience && (k.audience.women || k.audience.ages || k.audience.cities) ? `<h2>Público</h2><div class="card">${k.audience.women ? `<div class="m">Mulheres ${k.audience.women}% · Homens ${100 - k.audience.women}%</div><div class="bar"><i style="width:${k.audience.women}%"></i></div>` : ''}${k.audience.ages ? `<p><b>Idade:</b> ${e(k.audience.ages)}</p>` : ''}${k.audience.cities ? `<p><b>Cidades:</b> ${e(k.audience.cities)}</p>` : ''}</div>` : ''}
    ${s && s.src.length ? `<h2>De onde vem meu público</h2><div class="card">${s.src.map((x) => `<div class="row s"><span>${e(x.key)}</span><b>${Math.round(x.n / Math.max(1, s.visits) * 100)}%</b></div>`).join('')}</div>` : ''}
    ${lvl >= 2 && (k.brands || []).length ? `<h2>Marcas que já confiaram</h2><div class="tags">${k.brands.map((b) => `<span>${e(b)}</span>`).join('')}</div>` : ''}
    ${(k.prices || []).length ? `<h2>Formatos e valores</h2><div class="list">${k.prices.map((p) => `<div class="row"><span>${e(p.name)}</span><b>${e(p.price)}</b></div>`).join('')}</div>` : ''}
    <h2 id="contratar">Quero fazer uma parceria</h2>
    <form class="card" id="f"><input name="brand" placeholder="Nome da marca" required><input name="name" placeholder="Seu nome" required><input name="phone" placeholder="WhatsApp com DDD" inputmode="tel" required><input name="budget" placeholder="Orçamento (opcional)"><textarea name="message" placeholder="Conte sobre a campanha"></textarea><button>Enviar proposta</button><span class="m" id="fm"></span></form>
    ${lvl >= 2 ? '<button class="ghost noprint" onclick="window.print()">Baixar em PDF</button>' : ''}
    <p class="m noprint" style="text-align:center"><a href="/${e(u.handle)}">← whitelink.site/${e(u.handle)}</a></p>
    <script>document.getElementById('f').onsubmit=function(ev){ev.preventDefault();var f=ev.target,m=document.getElementById('fm');fetch('/api/pub/publi',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({h:${JSON.stringify(u.handle)},brand:f.brand.value,name:f.name.value,phone:f.phone.value,budget:f.budget.value,message:f.message.value})}).then(function(r){return r.json()}).then(function(d){if(d.ok){f.innerHTML='<b>Proposta enviada! Vou responder pelo WhatsApp.</b>'}else{m.textContent=d.error}})};</script>`;
  return page('Mídia kit · ' + (k.headline || u.name), body);
}

async function report(env, u) {
  const s = await stats(env, u.id, 30);
  const page0 = await loadPage(env, u.id);
  const cl = await env.DB.prepare('SELECT block_id, SUM(n) AS n FROM clicks WHERE user_id = ? AND day >= ? AND block_id > 0 AND block_id < 1000000 GROUP BY block_id ORDER BY n DESC LIMIT 10').bind(u.id, new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).all();
  const name = (id) => (page0.blocks.find((b) => b.id === id) || {}).title || 'Link';
  const body = `<p class="m">Relatório dos últimos 30 dias</p><h1>@${e(u.handle)}</h1>
    <div class="kp">${kpi(s.visits, 'visitas')}${kpi(s.clicks, 'cliques')}${kpi(s.visits ? Math.round(s.clicks / s.visits * 100) + '%' : '0%', 'taxa de clique')}</div>
    <h2>Links mais clicados</h2><div class="list">${(cl.results || []).map((x) => `<div class="row"><span>${e(name(x.block_id))}</span><b>${x.n}</b></div>`).join('') || '<p class="m">Sem cliques ainda.</p>'}</div>
    <h2>Origem das visitas</h2><div class="list">${s.src.map((x) => `<div class="row"><span>${e(x.key)}</span><b>${x.n}</b></div>`).join('')}</div>
    <h2>Cidades</h2><div class="list">${s.city.map((x) => `<div class="row"><span>${e(x.key)}</span><b>${x.n}</b></div>`).join('')}</div>
    <button class="ghost noprint" onclick="window.print()">Baixar em PDF</button>`;
  return page('Relatório · @' + u.handle, body);
}

function page(title, body, status = 200) {
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Space+Grotesk:wght@600;700&display=swap">
<style>body{margin:0;background:#0B0B10;color:#F3F3F7;font:15px/1.55 Inter,system-ui,sans-serif}main{max-width:640px;margin:0 auto;padding:32px 20px 60px}
h1{font:700 32px/1.15 'Space Grotesk',sans-serif;margin:4px 0 12px}h2{font:700 19px 'Space Grotesk',sans-serif;margin:30px 0 12px}.m{color:#A7A7B8;font-size:14px}a{color:#D4FF3A}
.ph{width:120px;height:120px;border-radius:50%;object-fit:cover;border:3px solid #D4FF3A;display:block}
.kp{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:18px 0}.k{background:#15151C;border:1px solid #24242E;border-radius:18px;padding:14px}.k b{display:block;font:700 24px 'Space Grotesk'}.k span{color:#A7A7B8;font-size:12.5px}
.card,.list{background:#15151C;border:1px solid #24242E;border-radius:18px;padding:14px 16px}.row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #22222B}.row:last-child{border:none}.row.s{padding:6px 0}
.big{font:700 28px 'Space Grotesk';display:block;margin:4px 0}.bar{height:10px;border-radius:9px;background:#8FE3FF33;overflow:hidden;margin:8px 0}.bar i{display:block;height:100%;background:#FF9AD5}
.tags{display:flex;flex-wrap:wrap;gap:8px}.tags span{padding:8px 14px;border-radius:999px;background:#15151C;border:1px solid #2A2A34;font-weight:600}
code{display:block;word-break:break-all;background:#0B0B10;padding:12px;border-radius:12px;margin:8px 0}
input,textarea{width:100%;box-sizing:border-box;height:48px;border-radius:12px;border:1px solid #2E2E3A;background:#0B0B10;color:#F3F3F7;padding:0 12px;font:15px Inter,sans-serif;margin-bottom:10px}textarea{height:90px;padding:12px}
button{width:100%;height:50px;border-radius:999px;border:none;background:#D4FF3A;color:#0E0E14;font:700 15px Inter,sans-serif;cursor:pointer;margin-top:6px}button.ghost{background:#24242E;color:#F3F3F7;margin-top:20px}
@media print{body{background:#fff;color:#111}.k,.card,.list,.tags span{background:#fff;border-color:#ddd}.m,.k span{color:#555}.noprint,#f,#contratar{display:none!important}a{color:#111}}</style></head>
<body><main>${body}</main></body></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
