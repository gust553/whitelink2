import { json, fail, readJson, currentUser, ensureSchema, effectivePlan, PLAN_LEVEL, rateLimit } from '../../src/lib.js';

// Chat de suporte do cliente. Prata: só assuntos de pagamento e teste grátis. Ouro e Diamante: qualquer assunto.
export async function onRequestGet({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const r = await env.DB.prepare('SELECT id, from_admin, text, created_at FROM support_msgs WHERE user_id = ? ORDER BY id ASC LIMIT 300').bind(u.id).all();
  await env.DB.prepare('UPDATE support_msgs SET read_at = ? WHERE user_id = ? AND from_admin = 1 AND read_at IS NULL').bind(Date.now(), u.id).run();
  return json({ ok: true, level: PLAN_LEVEL[effectivePlan(u).plan], name: u.name.split(' ')[0], msgs: r.results || [] });
}

export async function onRequestPost({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const b = (await readJson(request)) || {};
  const text = String(b.text || '').replace(/\s+\n/g, '\n').trim().slice(0, 1500);
  if (!text) return fail('Escreva sua mensagem.');
  const lvl = PLAN_LEVEL[effectivePlan(u).plan];
  const topic = ['pagamento', 'teste', 'pagina', 'temas', 'outro'].includes(b.topic) ? b.topic : 'outro';
  if (lvl === 0 && !['pagamento', 'teste'].includes(topic)) {
    const any = await env.DB.prepare('SELECT id FROM support_msgs WHERE user_id = ? LIMIT 1').bind(u.id).first();
    if (!any) return fail('No Prata, o chat é para pagamento e teste grátis. Para outras dúvidas, veja a Central de ajuda ou fale no WhatsApp.', 403);
  }
  if (!(await rateLimit(env, 'sup:' + u.id, 20, 3600000))) return fail('Muitas mensagens. Espere um pouco.', 429);
  const label = { pagamento: 'Pagamento', teste: 'Teste grátis', pagina: 'Minha página', temas: 'Temas', outro: 'Outro' }[topic];
  const first = !(await env.DB.prepare('SELECT id FROM support_msgs WHERE user_id = ? LIMIT 1').bind(u.id).first());
  await env.DB.prepare('INSERT INTO support_msgs (user_id, from_admin, text, created_at) VALUES (?, 0, ?, ?)')
    .bind(u.id, (first || b.topic ? '[' + label + '] ' : '') + text, Date.now()).run();
  return json({ ok: true });
}
