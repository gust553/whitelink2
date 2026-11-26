import { json, fail, readJson, currentUser, effectivePlan, PLAN_LEVEL, cleanText, rateLimit } from '../../src/lib.js';
import { statsData } from './stats.js';

// Assistente de IA (Cloudflare Workers AI). Ouro: 20 usos por mês. Diamante: 500.
const LIMIT = [0, 20, 500];
const MODEL = '@cf/meta/llama-3.1-8b-instruct';

const TASKS = {
  bio: (i) => `Escreva 4 opções de descrição curta (até 150 caracteres cada) para a página de links de um criador brasileiro. Sobre a pessoa: "${i}". Tom próximo, com no máximo 1 emoji por opção.`,
  titles: (i) => `Escreva 5 opções de texto curto (até 40 caracteres) para um botão de uma página de links (usada na bio, nos stories, em anúncios e no WhatsApp), que façam as pessoas clicarem. O link é sobre: "${i}". Use verbos de ação.`,
  product: (i) => `Escreva 3 opções de descrição de produto (até 200 caracteres cada) para vender por link no Instagram, WhatsApp e anúncios. Produto: "${i}". Destaque o benefício.`,
  quiz: (i) => `Sugira 4 perguntas de quiz divertido para indicar produtos. Tema: "${i}". Cada item deve ser só a pergunta.`,
  message: (i) => `Escreva 3 mensagens curtas de WhatsApp para um criador mandar a um cliente. Situação: "${i}". Tom educado e próximo, sem parecer robô.`
};

export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const lvl = PLAN_LEVEL[effectivePlan(u).plan];
  const used = await env.DB.prepare('SELECT n FROM ai_usage WHERE user_id = ? AND month = ?').bind(u.id, new Date().toISOString().slice(0, 7)).first();
  return json({ ok: true, level: lvl, limit: LIMIT[lvl], used: (used && used.n) || 0, enabled: !!env.AI });
}

export async function onRequestPost({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const lvl = PLAN_LEVEL[effectivePlan(u).plan];
  if (lvl < 1) return fail('O assistente de IA é do plano Ouro ou Diamante.', 403);
  if (!env.AI) return fail('O assistente de IA está sendo ativado. Tente mais tarde.', 503);
  if (!(await rateLimit(env, 'ai:' + u.id, 30, 3600000))) return fail('Muitos pedidos seguidos. Espere alguns minutos.', 429);
  const month = new Date().toISOString().slice(0, 7);
  const used = ((await env.DB.prepare('SELECT n FROM ai_usage WHERE user_id = ? AND month = ?').bind(u.id, month).first()) || {}).n || 0;
  if (used >= LIMIT[lvl]) return fail('Você usou os ' + LIMIT[lvl] + ' pedidos de IA deste mês.' + (lvl < 2 ? ' No Diamante são 500.' : ''), 429);
  const b = (await readJson(request)) || {};
  const input = cleanText(b.input, 300);
  let prompt;
  if (b.task === 'analyze') {
    if (lvl < 2) return fail('A análise da página é do Diamante.', 403);
    const d = await statsData(env, u, 30);
    const peak = d.hours ? d.hours.indexOf(Math.max(...d.hours)) : -1;
    prompt = `Você é consultor de marketing de criadores. Dados dos últimos 30 dias da página de links: ${d.visits} visitas, ${d.clicks || 0} cliques, ${d.contacts || 0} contatos. ` +
      `Links: ${(d.links || []).slice(0, 8).map((l) => '"' + l.title + '" ' + l.clicks + ' cliques').join('; ') || 'sem cliques'}. ` +
      `Origem: ${((d.breakdown && d.breakdown.src) || []).map((x) => x.k + ' ' + x.n).join(', ') || 'sem dados'}. ${peak >= 0 ? 'Horário de pico: ' + peak + 'h.' : ''} ` +
      `Dê 4 recomendações práticas e específicas (uma frase cada) para aumentar cliques e vendas.`;
  } else if (TASKS[b.task]) {
    if (!input) return fail('Escreva um pouco sobre o que você quer.');
    prompt = TASKS[b.task](input);
  } else return fail('Pedido inválido.');
  let out;
  try {
    const r = await env.AI.run(MODEL, { messages: [
      { role: 'system', content: 'Responda sempre em português do Brasil. Responda APENAS com um array JSON de strings, sem texto antes ou depois.' },
      { role: 'user', content: prompt }
    ], max_tokens: 600, temperature: 0.8 });
    const txt = String((r && (r.response || r.result)) || '');
    const m = txt.match(/\[[\s\S]*\]/);
    out = m ? JSON.parse(m[0]) : txt.split('\n').map((x) => x.replace(/^\s*[-*\d.)"]+\s*/, '').replace(/"$/, '').trim()).filter(Boolean);
    out = out.map((x) => String(typeof x === 'object' ? Object.values(x).join(' ') : x).trim()).filter(Boolean).slice(0, 6);
  } catch (e) { return fail('A IA não conseguiu responder agora. Tente de novo.', 502); }
  if (!out.length) return fail('A IA não conseguiu responder agora. Tente de novo.', 502);
  await env.DB.prepare('INSERT INTO ai_usage (user_id, month, n) VALUES (?, ?, 1) ON CONFLICT(user_id, month) DO UPDATE SET n = n + 1').bind(u.id, month).run();
  return json({ ok: true, items: out, left: LIMIT[lvl] - used - 1 });
}
