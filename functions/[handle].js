import { RESERVED, escapeHtml, effectivePlan, ensureSchema, loadPage, parsePageRow, BLOCK_NEED, PLAN_LEVEL, themeFor, customCss, cleanCustom, CUSTOM_FONTS } from '../src/lib.js';
import { TEMA_FONTS } from '../src/temas.js';
import { agendaCfg, brl } from '../src/biz.js';
import { goalView } from './api/pub.js';
import { getUserSettings as gus } from '../src/lib.js';

const BASIC = ['noite', 'papel', 'oceano', 'brasa'];
const FONTS = ["'Space Grotesk', Inter, sans-serif", 'Inter, system-ui, sans-serif', 'Georgia, serif'];
const RADII = ['6px', '14px', '999px'];

function youtubeId(url) {
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

function scheduledOk(b, now) {
  const s = b.start ? Date.parse(b.start + ':00-03:00') : 0;
  const e = b.end ? Date.parse(b.end + ':00-03:00') : 0;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

// Página pública: whitelink.site/nome
export async function onRequestGet(context) {
  const { env, params, next } = context;
  const raw = String(params.handle || '');
  const h = raw.toLowerCase();
  if (RESERVED.has(h) || /\.(html|css|js|png|jpg|jpeg|svg|ico|txt|xml|webmanifest|json)$/.test(h)) return next();
  if (!/^[a-z0-9._]{3,30}$/.test(h)) return notFound(context, raw);
  await ensureSchema(env);

  let u = await env.DB.prepare('SELECT id, name, instagram, handle, plan, plan_until, trial_until, status FROM users WHERE handle = ?').bind(h).first();
  let extra = null;
  if (!u) {
    // página extra do Diamante
    extra = await env.DB.prepare('SELECT * FROM pages WHERE handle = ?').bind(h).first();
    if (extra) u = await env.DB.prepare('SELECT id, name, instagram, handle, plan, plan_until, trial_until, status FROM users WHERE id = ?').bind(extra.user_id).first();
  }
  if (!u) return notFound(context, h);
  if (extra && effectivePlan(u).plan !== 'diamante') {
    return html('Página indisponível', `<div class="ph t-noite pub"><div class="ph-bg"></div><div class="ph-in"><div class="ph-head" style="margin-top:120px"><div class="ph-name">Esta página não está disponível</div><div class="ph-bio">Volte mais tarde.</div></div><a class="ph-btn main" href="/">Conheça o WhiteLink</a></div></div>`, 'noite', '', 404);
  }
  if (u.status !== 'ativo') {
    return html('Página indisponível', `<div class="ph t-noite pub"><div class="ph-bg"></div><div class="ph-in"><div class="ph-head" style="margin-top:120px"><div class="ph-name">Esta página não está disponível</div><div class="ph-bio">Volte mais tarde.</div></div><a class="ph-btn main" href="/">Conheça o WhiteLink</a></div></div>`, 'noite', '', 503);
  }

  const prof = extra ? { title: extra.title, bio: extra.bio } : ((await env.DB.prepare('SELECT title, bio FROM profiles WHERE user_id = ?').bind(u.id).first()) || {});
  const ep = effectivePlan(u);
  const lvl = PLAN_LEVEL[ep.plan];
  const { blocks, appearance: a } = extra ? parsePageRow(extra) : await loadPage(env, u.id);
  const useC = lvl === 2 && a.useCustom && a.custom;
  const tk = useC ? 'custom' : themeFor(a, lvl);
  const now = Date.now();

  let shown = blocks.filter((b) => b.on && BLOCK_NEED[b.kind] <= lvl && (lvl === 0 || scheduledOk(b, now)));
  const limit = { prata: 3, ouro: 10, diamante: 0 }[ep.plan];
  if (limit) { let n = 0; shown = shown.filter((b) => b.kind !== 'link' || ++n <= limit); }
  if (lvl === 2) {
    const st0 = await gus(env, u.id);
    if (st0.auto && st0.auto.order) { const { autoOrder } = await import('../src/auto.js'); shown = await autoOrder(env, u.id, extra ? extra.id * 1000000 : 0, shown); }
    var liveCfg = Object.assign({ viewers: true, sales: true }, st0.live || {});
  }
  const pinned = shown.filter((b) => b.featured || (lvl >= 1 && b.pin));
  shown = pinned.concat(shown.filter((b) => !(b.featured || (lvl >= 1 && b.pin))));

  context.waitUntil(env.DB.prepare(
    'INSERT INTO visits (user_id, day, views) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET views = views + 1'
  ).bind(u.id, new Date().toISOString().slice(0, 10)).run());
  context.waitUntil(trackMeta(env, context.request, u.id));
  // parceiro (afiliado) do criador: ?a=codigo guarda por 30 dias quem indicou
  let affCookie = '';
  const affCode = String(new URL(context.request.url).searchParams.get('a') || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  if (affCode && lvl === 2) {
    const af = await env.DB.prepare('SELECT code FROM affiliates WHERE user_id = ? AND code = ?').bind(u.id, affCode).first();
    if (af) {
      affCookie = `wl_a${u.id}=${af.code}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`;
      context.waitUntil(env.DB.prepare('INSERT INTO aff_stats (user_id, code, day, visits, clicks) VALUES (?, ?, ?, 1, 0) ON CONFLICT(user_id, code, day) DO UPDATE SET visits = visits + 1').bind(u.id, af.code, new Date().toISOString().slice(0, 10)).run());
    }
  }

  // dados das vendas (só se a página usa esses blocos)
  const kinds = new Set(shown.map((b) => b.kind));
  const st = kinds.has('store') || kinds.has('booking') || kinds.has('support') || kinds.has('quiz') ? await gus(env, u.id) : {};
  const pubData = { h, lvl };
  if (kinds.has('store')) {
    const pr = await env.DB.prepare('SELECT id, name, cents, image, descr, stock FROM products WHERE user_id = ? AND active = 1 ORDER BY position, id LIMIT ?').bind(u.id, lvl >= 2 ? 500 : 10).all();
    pubData.products = (pr.results || []).map((p) => ({ id: p.id, name: p.name, cents: p.cents, price: brl(p.cents), image: p.image ? '/m/' + p.image : '', descr: p.descr || '', out: p.stock === 0 }));
    pubData.coupons = lvl >= 2 && ((st.shop && st.shop.coupons) || []).length > 0;
    pubData.ship = lvl >= 2 ? (st.shop && st.shop.shipping) || 0 : 0;
    pubData.pix = lvl >= 2 && !!(st.pay && st.pay.key);
  }
  if (kinds.has('booking')) pubData.services = agendaCfg(st).services.slice(0, lvl >= 2 ? 30 : 1).map((x) => ({ id: x.id, name: x.name, minutes: x.minutes, price: x.cents ? brl(x.cents) : '', deposit: lvl >= 2 && x.deposit ? brl(x.deposit) : '' }));
  if (kinds.has('booking')) pubData.days = agendaCfg(st).days;
  if (kinds.has('support')) { pubData.goal = await goalView(env, { u, lvl, st }); pubData.supportPix = !!(st.pay && st.pay.key); }
  if (kinds.has('quiz')) pubData.quizzes = (st.quizzes || []).map((q) => ({ id: q.id, title: q.title, intro: q.intro, askContact: q.askContact, questions: q.questions }));
  const go = (b, v) => `/go/${extra ? 'x' + extra.id : u.id}/${b.id}${v ? '?v=b' : ''}`;
  const parts = shown.map((b) => {
    const useB = lvl === 2 && b.titleB ? Math.random() * 100 >= (b.split || 50) : false;
    const title = useB ? b.titleB : b.title;
    const t = escapeHtml(title);
    const fx = lvl >= 1 && b.effect ? ' fx-' + b.effect : '';
    const hasUrl = /^https?:\/\//.test(b.url || '');
    switch (b.kind) {
      case 'text': return `<p class="ph-bio pub-text">${t}</p>`;
      case 'link': return hasUrl ? `<a class="ph-btn${b.featured ? ' main' : ''}${fx}" href="${go(b, useB)}" rel="noopener">${t}</a>` : '';
      case 'video': {
        const id = youtubeId(b.url);
        if (id) return `<div class="ph-card pub-col"><div class="vid"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${t}" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div><b>${t}</b></div>`;
        return hasUrl ? `<a class="ph-btn${fx}" href="${go(b)}" rel="noopener">▶ ${t}</a>` : '';
      }
      case 'shop': {
        const [name, price] = String(title).split(/\s+·\s+|\s+-\s+R\$|\s+R\$/);
        const inner = `<div class="ph-thumb"></div><div class="ph-ct"><b>${escapeHtml(name)}</b>${price ? `<span>${escapeHtml(/R\$/.test(price) ? price : 'R$ ' + price.trim())}</span>` : ''}</div>`;
        return hasUrl ? `<a class="ph-card${fx}" href="${go(b)}" rel="noopener" style="color:inherit;text-decoration:none">${inner}</a>` : `<div class="ph-card">${inner}</div>`;
      }
      case 'gallery': return hasUrl ? `<a class="ph-btn${fx}" href="${go(b)}" rel="noopener">${t}</a>` : '';
      case 'timer': {
        const end = Date.parse(String(b.url || '').replace(' ', 'T') + ':00-03:00');
        if (!end || end < now) return '';
        return `<div class="ph-card pub-col timer" data-end="${end}"><b>${t}</b><div class="tm"><span><b>--</b>dias</span><span><b>--</b>horas</span><span><b>--</b>min</span><span><b>--</b>seg</span></div></div>`;
      }
      case 'lead': return `<form class="ph-card pub-col lead" data-src="${t}"><b>${t}</b><input name="name" placeholder="Seu nome" maxlength="60" aria-label="Seu nome"><input name="phone" placeholder="Seu WhatsApp com DDD" inputmode="tel" aria-label="Seu WhatsApp" required><button type="submit" class="ph-btn main">Quero receber</button><span class="msg"></span></form>`;
      case 'store': return pubData.products && pubData.products.length ? `<section class="pub-store"><b class="pub-sec">${t}</b><div class="pgrid">${pubData.products.map((p) => `<div class="pcard${p.out ? ' out' : ''}">${p.image ? `<img src="${p.image}" alt="" loading="lazy">` : '<div class="pimg"></div>'}<div class="pinfo"><span class="pname">${escapeHtml(p.name)}</span><span class="pprice">${p.price}</span></div><button type="button" class="padd" data-add="${p.id}"${p.out ? ' disabled' : ''}>${p.out ? 'Esgotado' : 'Adicionar'}</button></div>`).join('')}</div></section>` : '';
      case 'booking': return pubData.services && pubData.services.length ? `<button type="button" class="ph-btn main${fx}" data-open="booking">📅 ${t}</button>` : '';
      case 'support': { const g = pubData.goal; if (!g || !pubData.supportPix) return ''; return `<div class="ph-card pub-col goal"><b>${escapeHtml(g.title)}</b><div class="gbar"><i style="width:${g.pct}%"></i></div><div class="gnum"><span><b>${g.raisedLabel}</b> de ${g.goalLabel}</span><span>${g.count} ${g.count === 1 ? 'apoio' : 'apoios'}</span></div>${g.ranking && g.ranking.length ? `<div class="grank">${g.ranking.map((r, i) => `<span>${['🥇', '🥈', '🥉', '4º', '5º'][i]} ${escapeHtml(r.name)} <b>${r.value}</b></span>`).join('')}</div>` : ''}${g.messages && g.messages.length ? `<div class="gmsg">${g.messages.map((m) => `<p>“${escapeHtml(m.text)}” <span>— ${escapeHtml(m.name)}, ${m.value}</span></p>`).join('')}</div>` : ''}<button type="button" class="ph-btn main" data-open="support">💛 ${t}</button></div>`; }
      case 'quiz': { const q = (pubData.quizzes || []).find((x) => x.id === b.url) || (pubData.quizzes || [])[0]; return q && q.questions.length ? `<button type="button" class="ph-btn main${fx}" data-quiz="${q.id}">✨ ${t}</button>` : ''; }
      case 'mediakit': return lvl >= 1 ? `<a class="ph-btn${fx}" href="/${h}/midiakit">📊 ${t}</a>` : '';
      case 'pix': return b.url ? `<div class="pub-col pix"><button type="button" class="ph-btn pixb">${t}</button><div class="ph-card pub-col pixk hide"><code>${escapeHtml(b.url)}</code><button type="button" class="ph-btn main" data-k="${escapeHtml(b.url)}">Copiar chave Pix</button></div></div>` : '';
      default: return '';
    }
  }).join('');

  const title = prof.title || u.name;
  const initials = title.split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  let custom = useC ? customCss(cleanCustom(a.custom)) : '';
  const cfont = useC ? CUSTOM_FONTS[cleanCustom(a.custom).font] : '';
  if (!useC && lvl >= 1 && a.acc) custom += `.pub .ph-btn.main{background:${a.acc};border-color:${a.acc}}.pub .ph-av{border-color:${a.acc}}`;
  if (!useC && lvl >= 1 && BASIC.includes(tk)) custom += `.pub{font-family:${FONTS[a.font || 0]}}.pub .ph-btn{border-radius:${RADII[a.shape == null ? 1 : a.shape]}}`;
  const verified = lvl === 2 && !ep.trial ? ' <span class="ver" title="Verificado">✓</span>' : '';
  // capa (foto no Ouro, vídeo no Diamante), foto de perfil e animação de entrada
  let cover = '';
  if (lvl === 2 && a.coverVideo) {
    const yt = youtubeId(a.coverVideo);
    cover = yt ? `<div class="pub-cover vid-cover"><iframe src="https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&mute=1&loop=1&playlist=${yt}&controls=0&playsinline=1&modestbranding=1" title="" allow="autoplay; encrypted-media" tabindex="-1" aria-hidden="true"></iframe></div>`
      : `<div class="pub-cover"><video src="${escapeHtml(a.coverVideo)}" autoplay muted loop playsinline aria-hidden="true"></video></div>`;
  } else if (lvl >= 1 && a.cover) cover = `<div class="pub-cover"><img src="/m/${a.cover}" alt=""></div>`;
  const av = a.avatar ? `<div class="ph-av has-img"><img src="/m/${a.avatar}" alt="${escapeHtml(title)}"></div>` : `<div class="ph-av">${escapeHtml(initials)}</div>`;
  const anim = lvl >= 1 && a.anim && a.anim !== 'nenhuma' ? (lvl === 2 || ['subir', 'aparecer'].includes(a.anim) ? a.anim : 'subir') : '';
  const body = `
<div class="ph t-${tk} pub${cover ? ' has-cover' : ''}${anim ? ' anim-' + anim : ''}">
  <div class="ph-bg"></div>
  ${cover}
  <div class="ph-tag">NOVO!</div>
  <div class="ph-in">
    <div class="ph-head">
      ${av}
      <div class="ph-name">${escapeHtml(title)}${verified}</div>
      <a class="ph-handle" href="https://instagram.com/${escapeHtml(u.instagram)}" target="_blank" rel="noopener">@${escapeHtml(u.instagram)}</a>
      ${prof.bio ? `<div class="ph-bio">${escapeHtml(prof.bio)}</div>` : ''}
      <div class="ph-orn"></div>
    </div>
    ${parts || '<div class="ph-bio" style="text-align:center;margin:20px auto">Em breve, novos links por aqui.</div>'}
    ${lvl === 0 ? '<a class="ph-foot" href="/">Crie a sua com WhiteLink</a>' : '<div class="ph-foot"></div>'}
  </div>
</div>
<script>
(function(){
  document.querySelectorAll('.timer').forEach(function(el){var end=+el.dataset.end,b=el.querySelectorAll('.tm b');function t(){var s=Math.max(0,Math.floor((end-Date.now())/1000));var v=[Math.floor(s/86400),Math.floor(s%86400/3600),Math.floor(s%3600/60),s%60];b.forEach(function(x,i){x.textContent=String(v[i]).padStart(2,'0')});}t();setInterval(t,1000);});
  document.querySelectorAll('.pixb').forEach(function(btn){btn.onclick=function(){btn.nextElementSibling.classList.toggle('hide');};});
  document.querySelectorAll('[data-k]').forEach(function(btn){btn.onclick=function(){try{navigator.clipboard.writeText(btn.dataset.k);}catch(e){}btn.textContent='Chave copiada!';};});
  document.querySelectorAll('form.lead').forEach(function(f){f.onsubmit=function(e){e.preventDefault();var m=f.querySelector('.msg');fetch('/api/lead',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({h:${JSON.stringify(h)},name:f.name.value,phone:f.phone.value,source:f.dataset.src})}).then(function(r){return r.json()}).then(function(d){if(d.ok){f.innerHTML='<b>Pronto! Você vai receber as novidades.</b>';}else{m.textContent=d.error||'Tente de novo.';}}).catch(function(){m.textContent='Sem conexão.';});};});
})();
</script>
${lvl === 2 && liveCfg && (liveCfg.viewers || liveCfg.sales) ? `<script>window.WL_LIVE=${JSON.stringify({ h, v: !!liveCfg.viewers, s: !!liveCfg.sales })}</script><script src="/assets/live.js" defer></script>` : ''}
${kinds.has('store') || kinds.has('booking') || kinds.has('support') || kinds.has('quiz') ? `<script type="application/json" id="wl-data">${JSON.stringify(pubData).replace(/</g, '\\u003c')}</script><script src="/assets/pub.js" defer></script>` : ''}`;
  const cfgRow = await env.DB.prepare('SELECT data FROM user_settings WHERE user_id = ?').bind(u.id).first();
  let cfg = {}; try { cfg = JSON.parse((cfgRow && cfgRow.data) || '{}'); } catch (e) {}
  if (extra) cfg = Object.assign({}, cfg, { seo: {} }); // título do Google é só da página principal
  const res = html(title + ' | WhiteLink', body, tk, custom, 200, cfg, lvl, cfont);
  if (affCookie) res.headers.append('set-cookie', affCookie);
  return res;
}

async function trackMeta(env, request, userId) {
  try {
    const ref = (request.headers.get('referer') || '').toLowerCase();
    const ua = (request.headers.get('user-agent') || '').toLowerCase();
    const src = /instagram/.test(ua) || /instagram\.com/.test(ref) ? 'Instagram' : /tiktok/.test(ua + ref) ? 'TikTok' : /youtube/.test(ref) ? 'YouTube' : /whatsapp/.test(ua + ref) ? 'WhatsApp' : /facebook|fban|fbav/.test(ua + ref) ? 'Facebook' : ref ? 'Outros sites' : 'Direto';
    const dev = /iphone|ipad/.test(ua) ? 'iPhone' : /android/.test(ua) ? 'Android' : 'Computador';
    const city = (request.cf && request.cf.city) || 'Desconhecida';
    const day = new Date().toISOString().slice(0, 10);
    const br = new Date(Date.now() - 3 * 3600000);
    for (const [k, v] of [['src', src], ['dev', dev], ['city', city], ['hour', String(br.getUTCHours()).padStart(2, '0')], ['dow', String(br.getUTCDay())]]) {
      await env.DB.prepare('INSERT INTO visit_meta (user_id, day, kind, key, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT(user_id, day, kind, key) DO UPDATE SET n = n + 1')
        .bind(userId, day, k, String(v).slice(0, 60)).run();
    }
  } catch (e) {}
}

async function notFound({ env, request }, h) {
  try {
    const r = await env.ASSETS.fetch(new URL('/404.html', request.url));
    const t = (await r.text()).replace(/\{\{nome\}\}/g, escapeHtml(h));
    return new Response(t, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  } catch (e) {
    return new Response('Página não encontrada', { status: 404 });
  }
}

function html(title, body, tk, custom, status, a, lvl, cfont) {
  const fams = ['Inter:wght@400;500;600;700', 'Space+Grotesk:wght@500;700'].concat((cfont && !/^(Inter|Space Grotesk)$/.test(cfont) ? [cfont] : []).concat(TEMA_FONTS[tk] || []).map((f) => f.replace(/ /g, '+') + ':ital,wght@0,400;0,700;1,400'));
  const fontUrl = 'https://fonts.googleapis.com/css2?' + fams.map((f) => 'family=' + f).join('&') + '&display=swap';
  const seo = (a && a.seo) || {};
  const px = lvl === 2 && a && a.pixel ? a.pixel : '';
  const ga = lvl === 2 && a && a.ga ? a.ga : '';
  const out = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(seo.title || title)}</title>
${seo.desc ? `<meta name="description" content="${escapeHtml(seo.desc)}">` : ''}
<meta property="og:title" content="${escapeHtml(seo.title || title)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="${fontUrl.replace(/:ital,wght@0,400;0,700;1,400/g, '')}">
<link rel="stylesheet" href="/assets/temas.css">
<style>
html,body{margin:0;background:#0B0B10;min-height:100vh}
.ph.pub{width:100%;max-width:520px;height:auto;min-height:100vh;margin:0 auto;border:none;border-radius:0}
.ph.pub .ph-in{height:auto;min-height:100vh;padding:56px 20px 28px;gap:12px}
.ph.pub .ph-bg{position:absolute}
.ph.pub a{color:inherit;text-decoration:none}
.ph.pub .ph-btn{display:block;font-size:15px;padding:16px 18px}
.ph.pub .ph-handle{opacity:.75}
.ph.pub .ph-foot{padding-top:24px;display:block}
.pub-col{flex-direction:column;align-items:stretch;gap:10px;text-align:left}
.pub-text{max-width:none;text-align:center;font-size:15px;opacity:.9;white-space:pre-line;margin:2px 0}
.vid{position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000}.vid iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.tm{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.tm span{display:flex;flex-direction:column;align-items:center;padding:8px 0;border-radius:10px;background:rgba(0,0,0,.18);font-size:10px;text-transform:uppercase;opacity:.9}.tm b{font-size:22px}
.lead input{height:46px;border-radius:12px;border:1px solid rgba(127,127,127,.35);background:rgba(255,255,255,.08);color:inherit;padding:0 12px;font-size:15px;font-family:inherit}
.lead input::placeholder{color:inherit;opacity:.6}
.lead button,.pix button{border:none;cursor:pointer;font-family:inherit;width:100%}
.pixk code{word-break:break-all;font-size:13px;opacity:.85}
.hide{display:none!important}.msg{color:#FF8A6B;font-size:13px}
.ph-av.has-img{padding:0;overflow:hidden;background:none}.ph-av.has-img img{width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block}
.pub-cover{position:absolute;left:0;right:0;top:0;height:230px;overflow:hidden;z-index:0}
.pub-cover img,.pub-cover video{width:100%;height:100%;object-fit:cover;display:block}
.pub-cover iframe{position:absolute;left:50%;top:50%;width:177.78vh;min-width:100%;height:56.25vw;min-height:100%;transform:translate(-50%,-50%) scale(1.35);border:0;pointer-events:none}
.pub-cover{-webkit-mask-image:linear-gradient(180deg,#000 50%,transparent);mask-image:linear-gradient(180deg,#000 50%,transparent)}
.ph.pub.has-cover .ph-in{padding-top:150px;position:relative;z-index:1}
.ph.pub.has-cover .ph-av{width:104px;height:104px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
@keyframes wlUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes wlFade{from{opacity:0}to{opacity:1}}
@keyframes wlZoom{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
@keyframes wlSide{from{opacity:0;transform:translateX(-22px)}to{opacity:1;transform:none}}
.anim-subir .ph-in>*{animation:wlUp .55s cubic-bezier(.2,.8,.2,1) both}
.anim-aparecer .ph-in>*{animation:wlFade .7s ease both}
.anim-zoom .ph-in>*{animation:wlZoom .5s cubic-bezier(.2,.8,.2,1) both}
.anim-cascata .ph-in>*{animation:wlSide .55s cubic-bezier(.2,.8,.2,1) both}
${Array.from({ length: 30 }, (_, i) => `.ph-in>*:nth-child(${i + 1}){animation-delay:${i * 65}ms}`).join('')}
@media (prefers-reduced-motion:reduce){.ph-in>*{animation:none!important}}
.pub-store{display:flex;flex-direction:column;gap:10px}.pub-sec{font-size:15px;opacity:.9;padding:4px 2px}
.pgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pcard{border-radius:16px;overflow:hidden;background:rgba(127,127,127,.12);display:flex;flex-direction:column;backdrop-filter:blur(6px)}
.pcard img,.pcard .pimg{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:rgba(127,127,127,.18)}
.pinfo{padding:10px 10px 4px;display:flex;flex-direction:column;gap:2px;min-height:58px}.pname{font-size:13.5px;line-height:1.3;opacity:.95}.pprice{font-weight:700;font-size:15px}
.padd{margin:6px 10px 10px;height:38px;border-radius:12px;border:none;font-weight:600;font-size:13.5px;font-family:inherit;cursor:pointer;background:rgba(127,127,127,.24);color:inherit}
.padd.in{background:#D4FF3A;color:#0E0E14}
.pcard.out{opacity:.55}
.goal .gbar{height:12px;border-radius:999px;background:rgba(127,127,127,.25);overflow:hidden}.goal .gbar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#D4FF3A,#7CF5D0)}
.goal .gnum{display:flex;justify-content:space-between;font-size:13px;opacity:.9}.grank{display:flex;flex-direction:column;gap:4px;font-size:13.5px}.grank span{display:flex;justify-content:space-between}
.gmsg p{margin:6px 0 0;font-size:13.5px;line-height:1.45}.gmsg span{opacity:.7;font-size:12px}

.ver{display:inline-flex;width:20px;height:20px;border-radius:50%;background:#8FE3FF;color:#06222B;font-size:12px;align-items:center;justify-content:center;vertical-align:middle;-webkit-text-fill-color:#06222B;text-shadow:none}
@keyframes fxPulse{0%{box-shadow:0 0 0 0 rgba(212,255,58,.55)}70%{box-shadow:0 0 0 12px rgba(212,255,58,0)}100%{box-shadow:0 0 0 0 rgba(212,255,58,0)}}
@keyframes fxShake{0%,86%,100%{transform:rotate(0)}89%{transform:rotate(-2deg)}92%{transform:rotate(2deg)}95%{transform:rotate(-1deg)}}
@keyframes fxGlow{0%,100%{filter:brightness(1)}50%{filter:brightness(1.25)}}
.fx-pulse{animation:fxPulse 1.8s ease-out infinite}.fx-shake{animation:fxShake 2.4s ease-in-out infinite}.fx-glow{animation:fxGlow 1.6s ease-in-out infinite}
${custom}
</style>
${px ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(px)});fbq('track','PageView');</script>` : ''}
${ga ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(ga)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(ga)});</script>` : ''}
</head><body>${body}</body></html>`;
  return new Response(out, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
