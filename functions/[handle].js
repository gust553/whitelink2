import { RESERVED, escapeHtml, effectivePlan } from '../src/lib.js';

// Página pública: whitelink.site/nome
export async function onRequestGet(context) {
  const { request, env, params, next } = context;
  const raw = String(params.handle || '');
  const h = raw.toLowerCase();
  if (raw.includes('.') && !/^[a-z0-9._]{3,30}$/.test(h)) return next();
  if (RESERVED.has(h) || /\.(html|css|js|png|jpg|svg|ico|txt|xml|webmanifest)$/.test(h)) return next();
  if (!/^[a-z0-9._]{3,30}$/.test(h)) return notFound(context, raw);

  const u = await env.DB.prepare('SELECT id, name, instagram, handle, plan, plan_until, trial_until, status FROM users WHERE handle = ?').bind(h).first();
  if (!u) return notFound(context, h);
  if (u.status !== 'ativo') return page('Página indisponível', `<div class="empty"><h1>Esta página não está disponível</h1><p>Volte mais tarde.</p><a class="cta" href="/">Conheça o WhiteLink</a></div>`, 'noite', 503);

  const prof = (await env.DB.prepare('SELECT title, bio, theme FROM profiles WHERE user_id = ?').bind(u.id).first()) || {};
  const plan = effectivePlan(u).plan;
  const limit = { prata: 3, ouro: 10, diamante: 0 }[plan];
  let links = (await env.DB.prepare('SELECT id, title FROM links WHERE user_id = ? AND active = 1 ORDER BY position, id').bind(u.id).all()).results;
  if (limit) links = links.slice(0, limit);
  const theme = plan === 'prata' && !['noite', 'papel'].includes(prof.theme) ? 'noite' : (prof.theme || 'noite');

  context.waitUntil(env.DB.prepare(
    'INSERT INTO visits (user_id, day, views) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET views = views + 1'
  ).bind(u.id, new Date().toISOString().slice(0, 10)).run());

  const title = prof.title || u.name;
  const initials = title.split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  const body = `
  <main class="pg">
    <div class="av">${escapeHtml(initials)}</div>
    <h1>${escapeHtml(title)}</h1>
    <a class="ig" href="https://instagram.com/${escapeHtml(u.instagram)}" target="_blank" rel="noopener">@${escapeHtml(u.instagram)}</a>
    ${prof.bio ? `<p class="bio">${escapeHtml(prof.bio)}</p>` : ''}
    <div class="links">
      ${links.map((l) => `<a class="lk" href="/go/${l.id}" rel="noopener">${escapeHtml(l.title)}</a>`).join('') || '<p class="bio">Em breve, novos links por aqui.</p>'}
    </div>
    ${plan === 'prata' ? '<a class="brand" href="/">Crie a sua com <b>WhiteLink</b></a>' : ''}
  </main>`;
  return page(title + ' | WhiteLink', body, theme, 200);
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

function page(title, body, theme, status) {
  const T = {
    noite: { bg: '#0E0E14', fg: '#F3F3F7', card: '#17171F', line: '#26262F', muted: '#A7A7B8', acc: '#D4FF3A' },
    papel: { bg: '#F4F2EC', fg: '#16161A', card: '#FFFFFF', line: '#E2DFD6', muted: '#5C5C66', acc: '#1F5BFF' }
  }[theme] || {};
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@600;700&display=swap">
<style>
*{box-sizing:border-box}body{margin:0;background:${T.bg};color:${T.fg};font-family:Inter,system-ui,sans-serif;min-height:100vh}
.pg{max-width:480px;margin:0 auto;padding:48px 20px 32px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.av{width:92px;height:92px;border-radius:50%;background:${T.card};border:2px solid ${T.acc};display:flex;align-items:center;justify-content:center;font:700 30px 'Space Grotesk',sans-serif}
h1{margin:6px 0 0;font:700 22px 'Space Grotesk',sans-serif}.ig{color:${T.muted};font-size:14px;text-decoration:none}
.bio{margin:4px 0 0;color:${T.muted};font-size:14px;line-height:1.5;max-width:340px}
.links{width:100%;display:flex;flex-direction:column;gap:12px;margin-top:14px}
.lk{display:block;padding:16px 18px;border-radius:16px;background:${T.card};border:1px solid ${T.line};color:${T.fg};font-weight:600;font-size:15px;text-decoration:none;transition:transform .15s}
.lk:first-child{background:${T.acc};color:${theme === 'papel' ? '#fff' : '#0E0E14'};border-color:${T.acc}}.lk:hover{transform:translateY(-2px)}
.brand{margin-top:22px;color:${T.muted};font-size:12px;text-decoration:none}.brand b{color:${T.fg}}
.empty{max-width:420px;margin:0 auto;padding:120px 24px;text-align:center}.cta{display:inline-block;margin-top:18px;padding:14px 20px;border-radius:14px;background:${T.acc};color:#0E0E14;font-weight:600;text-decoration:none}
</style></head><body>${body}</body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
