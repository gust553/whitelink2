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
  const nets = k.networks || [];
  const total = nets.reduce((a, n) => a + n.followers, 0);
  const views = nets.reduce((a, n) => a + (n.views || 0), 0);
  const engs = nets.filter((n) => n.eng > 0);
  const eng = engs.length ? (engs.reduce((a, n) => a + n.eng * (n.followers || 1), 0) / engs.reduce((a, n) => a + (n.followers || 1), 0)) : 0;
  const s = lvl >= 2 && k.showStats !== false ? await stats(env, u.id, 30) : null;
  const photo = k.photo ? `<img class="ph" src="/m/${k.photo}" alt="">` : '';
  const pct = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',') + '%';
  const wa = k.wa !== false && u.phone ? 'https://wa.me/' + ((ph) => (ph.length <= 11 ? '55' + ph : ph))(String(u.phone).replace(/\D/g, '')) + '?text=' + encodeURIComponent('Olá! Vi seu mídia kit no WhiteLink e quero falar sobre uma parceria.') : '';
  const works = (k.works || []).filter((w) => w.brand || w.img);
  const upd = k.updated ? new Date(k.updated - 3 * 3600000).toISOString().slice(0, 10).split('-').reverse().join('/') : '';
  const body = `<header class="hd">${photo}<div><p class="m">${e(k.niche || 'Criador de conteúdo')}</p><h1>${e(k.headline || u.name)}</h1></div></header>
    ${k.about ? `<p>${e(k.about)}</p>` : ''}
    <div class="kp">${kpi(short(total), 'seguidores no total')}${eng ? kpi(pct(eng), 'engajamento médio') : ''}${views ? kpi(short(views), 'views médias por post') : ''}${s ? kpi(short(s.visits), 'visitas na página (30 dias)') + kpi(short(s.clicks), 'cliques (30 dias)') : ''}</div>
    ${nets.length ? `<h2>Redes</h2><div class="list">${nets.map((n) => `<div class="row"><span><b>${NET[n.net]}</b><br><span class="m">@${e(n.handle)}</span></span><span style="text-align:right"><b>${short(n.followers)}</b> seguidores${n.eng ? `<br><span class="m">${String(n.eng).replace('.', ',')}% engajamento</span>` : ''}${n.views ? `<br><span class="m">${short(n.views)} views/post</span>` : ''}</span></div>`).join('')}</div>` : ''}
    ${lvl >= 2 && k.audience && (k.audience.women || k.audience.ages || k.audience.cities) ? `<h2>Público</h2><div class="card">${k.audience.women ? `<div class="m">Mulheres ${k.audience.women}% · Homens ${100 - k.audience.women}%</div><div class="bar"><i style="width:${k.audience.women}%"></i></div>` : ''}${k.audience.ages ? `<div class="row s"><span>Idade principal</span><b>${e(k.audience.ages)}</b></div>` : ''}${k.audience.cities ? `<div class="row s"><span>Cidades</span><b>${e(k.audience.cities)}</b></div>` : ''}</div>` : ''}
    ${s && s.src.length ? `<h2>De onde vem meu público</h2><div class="card">${s.src.map((x) => `<div class="row s"><span>${e(x.key)}</span><b>${Math.round(x.n / Math.max(1, s.visits) * 100)}%</b></div>`).join('')}</div>` : ''}
    ${works.length ? `<h2>Trabalhos anteriores</h2><div class="works">${works.map((w) => `<${w.url ? `a href="${e(w.url)}" target="_blank" rel="noopener nofollow"` : 'div'} class="wk">${w.img ? `<img src="/m/${w.img}" alt="" loading="lazy">` : ''}<div><b>${e(w.brand)}</b>${w.result ? `<span class="m">${e(w.result)}</span>` : ''}</div></${w.url ? 'a' : 'div'}>`).join('')}</div>` : ''}
    ${lvl >= 2 && (k.brands || []).length ? `<h2>Marcas que já confiaram</h2><div class="tags">${k.brands.map((b) => `<span>${e(b)}</span>`).join('')}</div>` : ''}
    ${(k.prices || []).length ? `<h2>Formatos${k.showPrices !== false ? ' e valores' : ''}</h2><div class="list">${k.prices.map((p) => `<div class="row"><span>${e(p.name)}${p.detail ? `<br><span class="m">${e(p.detail)}</span>` : ''}</span><b>${k.showPrices !== false ? e(p.price) : ''}</b></div>`).join('')}</div>${k.showPrices === false ? '<p class="m">Valores sob consulta. Mande sua proposta abaixo.</p>' : ''}` : ''}
    <h2 id="contratar">Quero fazer uma parceria</h2>
    ${wa || k.email ? `<div class="cta noprint">${wa ? `<a class="btn" href="${wa}" target="_blank" rel="noopener">Chamar no WhatsApp</a>` : ''}${k.email ? `<a class="btn ghost" href="mailto:${e(k.email)}">${e(k.email)}</a>` : ''}</div><p class="m noprint">Ou mande a proposta por aqui:</p>` : ''}
    <form class="card" id="f"><input name="brand" placeholder="Nome da marca" required><input name="name" placeholder="Seu nome" required><input name="phone" placeholder="WhatsApp com DDD" inputmode="tel" required><input name="budget" placeholder="Orçamento (opcional)"><textarea name="message" placeholder="Conte sobre a campanha"></textarea><button>Enviar proposta</button><p class="m" id="fm" role="status"></p></form>
    <p class="only-print m">Contato: whitelink.site/${e(u.handle)}/midiakit${k.email ? ' · ' + e(k.email) : ''}</p>
    ${lvl >= 2 ? '<button class="ghost noprint" onclick="window.print()">Baixar em PDF</button>' : ''}
    ${upd ? `<p class="m" style="text-align:center">Atualizado em ${upd}</p>` : ''}
    <p class="m noprint" style="text-align:center"><a href="/${e(u.handle)}">← whitelink.site/${e(u.handle)}</a></p>
    <script>document.getElementById('f').onsubmit=function(ev){ev.preventDefault();var f=ev.target,m=document.getElementById('fm'),b=f.querySelector('button');b.disabled=true;fetch('/api/pub/publi',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({h:${JSON.stringify(u.handle)},brand:f.brand.value,name:f.name.value,phone:f.phone.value,budget:f.budget.value,message:f.message.value})}).then(function(r){return r.json()}).then(function(d){b.disabled=false;m.textContent=d.ok?'Proposta enviada! Vamos responder no seu WhatsApp.':(d.error||'Não deu para enviar.');if(d.ok)f.reset()}).catch(function(){b.disabled=false;m.textContent='Sem conexão. Tente de novo.'})}</script>`;
  const desc = (k.niche ? k.niche + ' · ' : '') + short(total) + ' seguidores' + (eng ? ' · ' + pct(eng) + ' de engajamento' : '') + '. Veja números, formatos e mande sua proposta.';
  return page('Mídia kit · ' + (k.headline || u.name), body, 200, { light: k.theme === 'claro', accent: k.accent || '#d4ff3a', desc, img: k.photo ? 'https://whitelink.site/m/' + k.photo : '' });
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

function page(title, body, status = 200, o = {}) {
  const ac = /^#[0-9a-f]{6}$/i.test(o.accent || '') ? o.accent : '#d4ff3a';
  const L = !!o.light;
  const v = L ? `--bg:#F6F6F8;--fg:#15151C;--card:#FFFFFF;--line:#E4E4EA;--m:#5D5D6E;--in:#FFFFFF;--ac:${ac};--acfg:#0E0E14;--ghost:#ECECF1` : `--bg:#0B0B10;--fg:#F3F3F7;--card:#15151C;--line:#24242E;--m:#A7A7B8;--in:#0B0B10;--ac:${ac};--acfg:#0E0E14;--ghost:#24242E`;
  const og = o.desc ? `<meta name="description" content="${e(o.desc)}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(o.desc)}"><meta property="og:type" content="profile">${o.img ? `<meta property="og:image" content="${e(o.img)}">` : ''}<meta name="twitter:card" content="summary">` : '';
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><meta name="robots" content="noindex">${og}
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Space+Grotesk:wght@600;700&display=swap" media="print" onload="this.media='all'">
<style>:root{${v}}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 Inter,system-ui,sans-serif}main{max-width:680px;margin:0 auto;padding:32px 20px 60px}
h1{font:700 32px/1.15 'Space Grotesk',sans-serif;margin:4px 0 12px}h2{font:700 19px 'Space Grotesk',sans-serif;margin:30px 0 12px}.m{color:var(--m);font-size:14px}a{color:var(--ac)}
.hd{display:flex;gap:18px;align-items:center;flex-wrap:wrap}.ph{width:110px;height:110px;border-radius:50%;object-fit:cover;border:3px solid var(--ac);display:block;flex:none}
.kp{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:18px 0}.k{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px}.k b{display:block;font:700 24px 'Space Grotesk'}.k span{color:var(--m);font-size:12.5px}
.card,.list{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px 16px}.row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}.row:last-child{border:none}.row.s{padding:6px 0}
.big{font:700 28px 'Space Grotesk';display:block;margin:4px 0}.bar{height:10px;border-radius:9px;background:#8FE3FF33;overflow:hidden;margin:8px 0}.bar i{display:block;height:100%;background:#FF9AD5}
.tags{display:flex;flex-wrap:wrap;gap:8px}.tags span{padding:8px 14px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-weight:600}
.works{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}.wk{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;color:inherit;text-decoration:none}.wk img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}.wk div{padding:12px 14px;display:flex;flex-direction:column;gap:2px}
.cta{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px}.btn{flex:1;min-width:180px;display:flex;align-items:center;justify-content:center;height:50px;border-radius:999px;background:var(--ac);color:var(--acfg);font-weight:700;text-decoration:none;padding:0 16px}.btn.ghost{background:var(--ghost);color:var(--fg)}
code{display:block;word-break:break-all;background:var(--in);padding:12px;border-radius:12px;margin:8px 0}
input,textarea{width:100%;box-sizing:border-box;height:48px;border-radius:12px;border:1px solid var(--line);background:var(--in);color:var(--fg);padding:0 12px;font:15px Inter,sans-serif;margin-bottom:10px}textarea{height:90px;padding:12px}
button{width:100%;height:50px;border-radius:999px;border:none;background:var(--ac);color:var(--acfg);font:700 15px Inter,sans-serif;cursor:pointer;margin-top:6px}button.ghost{background:var(--ghost);color:var(--fg);margin-top:20px}button:disabled{opacity:.6}
.only-print{display:none}
@media print{:root{--bg:#fff;--fg:#111;--card:#fff;--line:#ddd;--m:#555}.noprint,#f,#contratar{display:none!important}.only-print{display:block}a{color:#111}.wk{break-inside:avoid}}</style></head>
<body><main>${body}</main></body></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
