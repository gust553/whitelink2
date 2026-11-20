import { RESERVED, escapeHtml, effectivePlan, ensureSchema, loadPage, BLOCK_NEED, PLAN_LEVEL, themeFor, customCss, cleanCustom, CUSTOM_FONTS } from '../src/lib.js';
import { TEMA_FONTS } from '../src/temas.js';

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

  const u = await env.DB.prepare('SELECT id, name, instagram, handle, plan, plan_until, trial_until, status FROM users WHERE handle = ?').bind(h).first();
  if (!u) return notFound(context, h);
  if (u.status !== 'ativo') {
    return html('Página indisponível', `<div class="ph t-noite pub"><div class="ph-bg"></div><div class="ph-in"><div class="ph-head" style="margin-top:120px"><div class="ph-name">Esta página não está disponível</div><div class="ph-bio">Volte mais tarde.</div></div><a class="ph-btn main" href="/">Conheça o WhiteLink</a></div></div>`, 'noite', '', 503);
  }

  const prof = (await env.DB.prepare('SELECT title, bio FROM profiles WHERE user_id = ?').bind(u.id).first()) || {};
  const ep = effectivePlan(u);
  const lvl = PLAN_LEVEL[ep.plan];
  const { blocks, appearance: a } = await loadPage(env, u.id);
  const useC = lvl === 2 && a.useCustom && a.custom;
  const tk = useC ? 'custom' : themeFor(a, lvl);
  const now = Date.now();

  let shown = blocks.filter((b) => b.on && BLOCK_NEED[b.kind] <= lvl && (lvl === 0 || scheduledOk(b, now)));
  const limit = { prata: 3, ouro: 10, diamante: 0 }[ep.plan];
  if (limit) { let n = 0; shown = shown.filter((b) => b.kind !== 'link' || ++n <= limit); }
  const pinned = shown.filter((b) => b.featured || (lvl >= 1 && b.pin));
  shown = pinned.concat(shown.filter((b) => !(b.featured || (lvl >= 1 && b.pin))));

  context.waitUntil(env.DB.prepare(
    'INSERT INTO visits (user_id, day, views) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET views = views + 1'
  ).bind(u.id, new Date().toISOString().slice(0, 10)).run());
  context.waitUntil(trackMeta(env, context.request, u.id));

  const go = (b, v) => `/go/${u.id}/${b.id}${v ? '?v=b' : ''}`;
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
  const body = `
<div class="ph t-${tk} pub">
  <div class="ph-bg"></div>
  <div class="ph-tag">NOVO!</div>
  <div class="ph-in">
    <div class="ph-head">
      <div class="ph-av">${escapeHtml(initials)}</div>
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
  document.querySelectorAll('form.lead').forEach(function(f){f.onsubmit=function(e){e.preventDefault();var m=f.querySelector('.msg');fetch('/api/lead',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({h:${JSON.stringify(u.handle)},name:f.name.value,phone:f.phone.value,source:f.dataset.src})}).then(function(r){return r.json()}).then(function(d){if(d.ok){f.innerHTML='<b>Pronto! Você vai receber as novidades.</b>';}else{m.textContent=d.error||'Tente de novo.';}}).catch(function(){m.textContent='Sem conexão.';});};});
})();
</script>`;
  const cfgRow = await env.DB.prepare('SELECT data FROM user_settings WHERE user_id = ?').bind(u.id).first();
  let cfg = {}; try { cfg = JSON.parse((cfgRow && cfgRow.data) || '{}'); } catch (e) {}
  return html(title + ' | WhiteLink', body, tk, custom, 200, cfg, lvl, cfont);
}

async function trackMeta(env, request, userId) {
  try {
    const ref = (request.headers.get('referer') || '').toLowerCase();
    const ua = (request.headers.get('user-agent') || '').toLowerCase();
    const src = /instagram/.test(ua) || /instagram\.com/.test(ref) ? 'Instagram' : /tiktok/.test(ua + ref) ? 'TikTok' : /youtube/.test(ref) ? 'YouTube' : /whatsapp/.test(ua + ref) ? 'WhatsApp' : /facebook|fban|fbav/.test(ua + ref) ? 'Facebook' : ref ? 'Outros sites' : 'Direto';
    const dev = /iphone|ipad/.test(ua) ? 'iPhone' : /android/.test(ua) ? 'Android' : 'Computador';
    const city = (request.cf && request.cf.city) || 'Desconhecida';
    const day = new Date().toISOString().slice(0, 10);
    for (const [k, v] of [['src', src], ['dev', dev], ['city', city]]) {
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
