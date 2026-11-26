import { json, cleanHandle, rateLimit, clientIp, ensureSchema, handleTaken } from '../../src/lib.js';

// Diz se um endereço whitelink.site/nome está livre
export async function onRequestGet({ request, env }) {
  const h = cleanHandle(new URL(request.url).searchParams.get('h'));
  if (!h) return json({ ok: true, free: false, reason: 'Use de 3 a 30 letras, números, ponto ou _.' });
  if (!(await rateLimit(env, 'hc:' + clientIp(request), 60, 60000))) return json({ ok: true, free: null });
  await ensureSchema(env);
  return json({ ok: true, free: !(await handleTaken(env, h)), handle: h });
}
