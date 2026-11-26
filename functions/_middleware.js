import { ensureSchema } from '../src/lib.js';

// Cabeçalhos de segurança em todas as respostas
export async function onRequest({ request, env, next }) {
  // Bloqueia chamadas de outros sites para a API (proteção contra CSRF)
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') && request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== url.host) {
      return new Response('{"ok":false,"error":"Origem não permitida."}', { status: 403, headers: { 'content-type': 'application/json' } });
    }
  }
  // garante que todas as tabelas existem antes de qualquer chamada à API ou página pública
  if (env && env.DB && !url.pathname.startsWith('/assets/')) { try { await ensureSchema(env); } catch (e) {} }
  const res = await next();
  const r = new Response(res.body, res);
  r.headers.set('x-content-type-options', 'nosniff');
  r.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  r.headers.set('x-frame-options', 'DENY');
  r.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  return r;
}
