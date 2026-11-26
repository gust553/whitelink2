// Clientes do criador (mini-CRM): cada contato, compra, agendamento, apoio ou resposta de quiz
// vira uma pessoa com histórico. Também gera os avisos (sino e celular).
import { cleanText } from './lib.js';

export function cleanPhoneBR(v) {
  let p = String(v || '').replace(/\D/g, '');
  if (p.startsWith('55') && p.length >= 12) p = p.slice(2);
  return p.length >= 10 && p.length <= 11 ? p : '';
}

// Cria ou atualiza a pessoa e registra o acontecimento
export async function track(env, userId, { phone, name, email, kind, title, cents = 0, ref = '', aff = '' }) {
  const now = Date.now();
  const ph = cleanPhoneBR(phone) || (email ? 'e:' + String(email).toLowerCase().slice(0, 120) : '');
  let personId = null;
  if (ph) {
    await env.DB.prepare(
      `INSERT INTO people (user_id, phone, name, email, aff, total_cents, created_at, last_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(user_id, phone) DO UPDATE SET name = COALESCE(NULLIF(excluded.name, ''), people.name), email = COALESCE(NULLIF(excluded.email, ''), people.email), aff = COALESCE(people.aff, excluded.aff), last_at = excluded.last_at`
    ).bind(userId, ph, cleanText(name, 60), email || '', aff || null, now, now).run();
    const p = await env.DB.prepare('SELECT id FROM people WHERE user_id = ? AND phone = ?').bind(userId, ph).first();
    personId = p && p.id;
  }
  const r = await env.DB.prepare('INSERT INTO events (user_id, person_id, kind, title, cents, ref, aff, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(userId, personId, kind, cleanText(title, 160), cents | 0, String(ref || '').slice(0, 60), aff || null, now).run();
  return { personId, eventId: r.meta && r.meta.last_row_id };
}

// Soma no total gasto quando um pagamento é confirmado
export async function addPaid(env, userId, personId, cents) {
  if (!personId) return;
  await env.DB.prepare("UPDATE people SET total_cents = total_cents + ?, stage = CASE WHEN stage IN ('novo','conversando') THEN 'cliente' ELSE stage END WHERE id = ? AND user_id = ?").bind(cents | 0, personId, userId).run();
}

// Aviso para o criador (aparece no sino do painel e, se ativado, no celular)
export async function notify(env, userId, kind, text, url) {
  await env.DB.prepare('INSERT INTO notifications (user_id, kind, text, url, created_at) VALUES (?, ?, ?, ?, ?)').bind(userId, kind, String(text).slice(0, 200), url || '', Date.now()).run();
  try { const { pushTo } = await import('./push.js'); await pushTo(env, userId, kind, text, url); } catch (e) {}
}
