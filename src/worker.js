// Ponto de entrada do WhiteLink na Cloudflare (Worker com arquivos estáticos)
import * as mw from '../functions/_middleware.js';
import * as signupStart from '../functions/api/auth/signup-start.js';
import * as signupVerify from '../functions/api/auth/signup-verify.js';
import * as login from '../functions/api/auth/login.js';
import * as logout from '../functions/api/auth/logout.js';
import * as resetStart from '../functions/api/auth/reset-start.js';
import * as resetFinish from '../functions/api/auth/reset-finish.js';
import * as me from '../functions/api/me.js';
import * as handleCheck from '../functions/api/handle-check.js';
import * as linksIndex from '../functions/api/links/index.js';
import * as linksId from '../functions/api/links/[id].js';
import * as go from '../functions/go/[id].js';
import * as goBlock from '../functions/go/[uid]/[bid].js';
import * as editor from '../functions/api/editor.js';
import * as lead from '../functions/api/lead.js';
import * as appearance from '../functions/api/appearance.js';
import * as profile from '../functions/[handle].js';

const ROUTES = [
  [/^\/api\/auth\/signup-start$/, signupStart],
  [/^\/api\/auth\/signup-verify$/, signupVerify],
  [/^\/api\/auth\/login$/, login],
  [/^\/api\/auth\/logout$/, logout],
  [/^\/api\/auth\/reset-start$/, resetStart],
  [/^\/api\/auth\/reset-finish$/, resetFinish],
  [/^\/api\/me$/, me],
  [/^\/api\/handle-check$/, handleCheck],
  [/^\/api\/links$/, linksIndex],
  [/^\/api\/links\/(?<id>\d+)$/, linksId],
  [/^\/api\/editor$/, editor],
  [/^\/api\/lead$/, lead],
  [/^\/api\/appearance$/, appearance],
  [/^\/go\/(?<uid>\d+)\/(?<bid>\d+)$/, goBlock],
  [/^\/go\/(?<id>\d+)$/, go],
  [/^\/(?<handle>[^/]+)$/, profile]
];

const METHOD = { GET: 'onRequestGet', POST: 'onRequestPost', PUT: 'onRequestPut', DELETE: 'onRequestDelete' };

async function serveStatic(request, env) {
  const res = await env.ASSETS.fetch(request);
  if (res.status !== 404) return res;
  const nf = await env.ASSETS.fetch(new URL('/404.html', request.url));
  return new Response(nf.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function route(request, env, ctx) {
  const url = new URL(request.url);
  // www.whitelink.site → whitelink.site
  if (url.hostname.startsWith('www.')) {
    url.hostname = url.hostname.slice(4);
    return Response.redirect(url.toString(), 301);
  }
  const next = () => serveStatic(request, env);
  for (const [re, mod] of ROUTES) {
    const m = url.pathname.match(re);
    if (!m) continue;
    const fn = mod[METHOD[request.method]];
    if (!fn) {
      if (mod === profile) return next();
      return new Response('{"ok":false,"error":"Método não permitido."}', { status: 405, headers: { 'content-type': 'application/json' } });
    }
    return fn({ request, env, params: m.groups || {}, next, waitUntil: (p) => ctx.waitUntil(p) });
  }
  if (url.pathname.startsWith('/api/')) {
    return new Response('{"ok":false,"error":"Não encontrado."}', { status: 404, headers: { 'content-type': 'application/json' } });
  }
  return next();
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await mw.onRequest({ request, next: () => route(request, env, ctx) });
    } catch (e) {
      console.error(e);
      return new Response('{"ok":false,"error":"Erro no servidor. Tente de novo."}', { status: 500, headers: { 'content-type': 'application/json' } });
    }
  }
};
