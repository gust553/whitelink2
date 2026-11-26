// Links inteligentes: abrir direto no app, destino por aparelho/horário e links de campanha
import { escapeHtml } from './lib.js';

export function deviceOf(ua) {
  ua = String(ua || '').toLowerCase();
  return /iphone|ipad|ipod/.test(ua) ? 'ios' : /android/.test(ua) ? 'android' : 'desktop';
}
export function inApp(ua) { return /instagram|fban|fbav|tiktok|musical_ly|bytedance|line\//i.test(String(ua || '')); }

// Diamante: escolhe o destino pelas regras do bloco
export function ruleUrl(b, ua) {
  const r = b.rules;
  if (!r) return b.url;
  if (r.alt && r.altFrom && r.altTo) {
    const now = new Date(Date.now() - 3 * 3600000);
    const m = now.getUTCHours() * 60 + now.getUTCMinutes();
    const a = +r.altFrom.slice(0, 2) * 60 + +r.altFrom.slice(3), z = +r.altTo.slice(0, 2) * 60 + +r.altTo.slice(3);
    if (a <= z ? m >= a && m < z : m >= a || m < z) return r.alt;
  }
  const d = deviceOf(ua);
  return r[d] || b.url;
}

// Endereço que abre o app (quando existe)
function appUrl(url, dev) {
  let u; try { u = new URL(url); } catch (e) { return ''; }
  const h = u.hostname.replace(/^www\.|^m\./, '');
  const intent = (scheme, pkg) => 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=' + scheme + ';package=' + pkg + ';S.browser_fallback_url=' + encodeURIComponent(url) + ';end';
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(h)) return dev === 'android' ? intent('https', 'com.google.android.youtube') : 'youtube://' + url.replace(/^https?:\/\//, '');
  if (/(^|\.)instagram\.com$/.test(h)) { const user = u.pathname.split('/').filter(Boolean)[0]; return dev === 'android' ? intent('https', 'com.instagram.android') : user && !['p', 'reel', 'stories'].includes(user) ? 'instagram://user?username=' + user : ''; }
  if (/^wa\.me$|(^|\.)whatsapp\.com$/.test(h)) { const ph = h === 'wa.me' ? u.pathname.slice(1) : u.searchParams.get('phone') || ''; return 'whatsapp://send?phone=' + ph.replace(/\D/g, '') + (u.searchParams.get('text') ? '&text=' + encodeURIComponent(u.searchParams.get('text')) : ''); }
  if (/(^|\.)tiktok\.com$/.test(h)) return dev === 'android' ? intent('https', 'com.zhiliaoapp.musically') : '';
  if (/(^|\.)spotify\.com$/.test(h)) return dev === 'android' ? intent('https', 'com.spotify.music') : 'spotify://' + u.pathname.slice(1).replace('/', ':');
  return '';
}

// Ouro+: dentro do navegador do Instagram/TikTok, tenta abrir no app de verdade
export function openInApp(url, ua) {
  if (!inApp(ua)) return null;
  const dev = deviceOf(ua);
  if (dev === 'desktop') return null;
  const app = appUrl(url, dev);
  if (!app) return null;
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abrindo…</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B0B10;color:#F3F3F7;font:16px Inter,system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}a{display:inline-block;margin-top:16px;padding:14px 22px;border-radius:999px;background:#D4FF3A;color:#0E0E14;text-decoration:none;font-weight:700}</style></head>
<body><div><p>Abrindo no aplicativo…</p><a href="${escapeHtml(url)}">Continuar no navegador</a></div>
<script>location.href=${JSON.stringify(app)};setTimeout(function(){location.replace(${JSON.stringify(url)})},1500);</script></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// /nome/<link> — link de campanha (Diamante)
export async function campaignLink({ env, request, waitUntil }, u, lvl, st, slug) {
  if (lvl < 2) return null;
  const l = await env.DB.prepare('SELECT * FROM camp_links WHERE user_id = ? AND slug = ?').bind(u.id, slug).first();
  if (!l) return null;
  const p = env.DB.prepare('INSERT INTO camp_clicks (link_id, day, n) VALUES (?, ?, 1) ON CONFLICT(link_id, day) DO UPDATE SET n = n + 1').bind(l.id, new Date().toISOString().slice(0, 10)).run();
  if (waitUntil) waitUntil(p); else await p;
  let dest = l.url;
  if (dest === 'page') dest = 'https://whitelink.site/' + u.handle + '?utm_source=whitelink&utm_campaign=' + encodeURIComponent(slug);
  const ua = request.headers.get('user-agent') || '';
  return openInApp(dest, ua) || Response.redirect(dest, 302);
}
