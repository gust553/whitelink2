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
import * as billing from '../functions/api/billing.js';
import * as ordersIndex from '../functions/api/orders/index.js';
import * as orderOne from '../functions/api/orders/[code].js';
import * as stats from '../functions/api/stats.js';
import * as statsCsv from '../functions/api/stats-csv.js';
import * as contacts from '../functions/api/contacts.js';
import * as settingsApi from '../functions/api/settings.js';
import * as account from '../functions/api/account/index.js';
import * as accountPhone from '../functions/api/account/phone.js';
import * as referrals from '../functions/api/referrals.js';
import * as support from '../functions/api/support.js';
import * as pagesApi from '../functions/api/pages.js';
import * as domainApi from '../functions/api/domain.js';
import * as mediaApi from '../functions/api/media.js';
import * as mediaGet from '../functions/m/[id].js';
import * as bizApi from '../functions/api/biz.js';
import * as productsApi from '../functions/api/products.js';
import * as salesApi from '../functions/api/sales.js';
import * as pubApi from '../functions/api/pub.js';
import * as crmApi from '../functions/api/crm.js';
import * as campApi from '../functions/api/campaigns.js';
import * as mkApi from '../functions/api/mediakit.js';
import * as affApi from '../functions/api/affiliates.js';
import * as subPage from '../functions/[handle]/[sub].js';
import { isMainHost, domainOwner, domainCleanup, domainSeen } from './domains.js';
import { effectivePlan } from './lib.js';
import * as gwHook from '../functions/api/webhooks/gateway.js';
import * as admVerify from '../functions/api/admin/verify.js';
import * as admOverview from '../functions/api/admin/overview.js';
import * as admUsers from '../functions/api/admin/users/index.js';
import * as admUser from '../functions/api/admin/users/[id].js';
import * as admSettings from '../functions/api/admin/settings.js';
import * as admSupport from '../functions/api/admin/support/index.js';
import * as admSupportOne from '../functions/api/admin/support/[id].js';
import * as admRefs from '../functions/api/admin/referrals.js';
import * as admFraud from '../functions/api/admin/fraud.js';
import * as adminOrders from '../functions/api/admin/orders/index.js';
import * as adminOrderOne from '../functions/api/admin/orders/[code].js';
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
  [/^\/api\/billing$/, billing],
  [/^\/api\/orders$/, ordersIndex],
  [/^\/api\/orders\/(?<code>[A-Za-z0-9]+)$/, orderOne],
  [/^\/api\/stats$/, stats],
  [/^\/api\/stats\/csv$/, statsCsv],
  [/^\/api\/contacts$/, contacts],
  [/^\/api\/settings$/, settingsApi],
  [/^\/api\/account$/, account],
  [/^\/api\/account\/phone$/, accountPhone],
  [/^\/api\/referrals$/, referrals],
  [/^\/api\/support$/, support],
  [/^\/api\/pages$/, pagesApi],
  [/^\/api\/domain$/, domainApi],
  [/^\/api\/media$/, mediaApi],
  [/^\/api\/biz$/, bizApi],
  [/^\/api\/products$/, productsApi],
  [/^\/api\/sales$/, salesApi],
  [/^\/api\/crm$/, crmApi],
  [/^\/api\/campaigns$/, campApi],
  [/^\/api\/mediakit$/, mkApi],
  [/^\/api\/affiliates$/, affApi],
  [/^\/api\/pub\/(?<action>order|slots|book|support|quiz|goal|publi)$/, pubApi],
  [/^\/m\/(?<id>[a-f0-9]{8,40})$/, mediaGet],
  [/^\/api\/webhooks\/gateway$/, gwHook],
  [/^\/api\/admin\/verify$/, admVerify],
  [/^\/api\/admin\/overview$/, admOverview],
  [/^\/api\/admin\/users$/, admUsers],
  [/^\/api\/admin\/users\/(?<id>\d+)$/, admUser],
  [/^\/api\/admin\/settings$/, admSettings],
  [/^\/api\/admin\/support$/, admSupport],
  [/^\/api\/admin\/support\/(?<id>\d+)$/, admSupportOne],
  [/^\/api\/admin\/referrals$/, admRefs],
  [/^\/api\/admin\/fraud$/, admFraud],
  [/^\/api\/admin\/orders$/, adminOrders],
  [/^\/api\/admin\/orders\/(?<code>[A-Za-z0-9]+)$/, adminOrderOne],
  [/^\/go\/(?<uid>x?\d+)\/(?<bid>\d+)$/, goBlock],
  [/^\/go\/(?<id>\d+)$/, go],
  [/^\/(?<handle>[a-z0-9._]{3,30})\/(?<sub>[a-z0-9-]{2,40})$/i, subPage],
  [/^\/(?<handle>[^/]+)$/, profile]
];

const METHOD = { GET: 'onRequestGet', POST: 'onRequestPost', PUT: 'onRequestPut', DELETE: 'onRequestDelete' };

async function serveStatic(request, env) {
  const res = await env.ASSETS.fetch(request);
  if (res.status !== 404) return res;
  const nf = await env.ASSETS.fetch(new URL('/404.html', request.url));
  return new Response(nf.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function route(request, env, ctx, inner) {
  const url = new URL(request.url);
  // domínio próprio de um cliente Diamante (ex.: links.lojadamari.com.br)
  if (!inner && !isMainHost(url.hostname)) return customHost(request, env, ctx, url);
  // www.whitelink.site → whitelink.site
  if (url.hostname === 'www.whitelink.site') {
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

async function customHost(request, env, ctx, url) {
  const o = await domainOwner(env, url.hostname);
  if (!o) return Response.redirect('https://whitelink.site/', 302);
  const p = url.pathname;
  // a página do cliente fica na raiz do domínio dele; cliques, captura e arquivos funcionam normalmente
  if (p === '/' || p === '') {
    if (effectivePlan(o).plan !== 'diamante') return Response.redirect('https://whitelink.site/' + o.handle, 302);
    if (o.dstatus !== 'ativo' && url.protocol === 'https:') ctx.waitUntil(domainSeen(env, o.user_id));
    const r = new Request(new URL('/' + o.handle, url).toString(), request);
    return route(r, env, ctx, true);
  }
  if (/^\/(go\/|assets\/|m\/|api\/lead$|api\/pub\/|favicon)/.test(p)) return route(request, env, ctx, true);
  return Response.redirect('https://whitelink.site' + p + url.search, 302);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(domainCleanup(env));
  },
  async fetch(request, env, ctx) {
    try {
      return await mw.onRequest({ request, env, next: () => route(request, env, ctx) });
    } catch (e) {
      console.error(e);
      return new Response('{"ok":false,"error":"Erro no servidor. Tente de novo."}', { status: 500, headers: { 'content-type': 'application/json' } });
    }
  }
};
