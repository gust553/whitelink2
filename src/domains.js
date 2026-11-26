// Domínio próprio do cliente Diamante (Cloudflare for SaaS)
// O cliente aponta o domínio dele (CNAME) para clientes.whitelink.site; a Cloudflare cria o certificado e manda o tráfego para cá.
import { getSettings } from './billing.js';
import { effectivePlan } from './lib.js';

export const MAIN_HOSTS = ['whitelink.site', 'www.whitelink.site', 'localhost', '127.0.0.1'];
export const TARGET = 'clientes.whitelink.site';

export function isMainHost(h) {
  h = String(h || '').toLowerCase().split(':')[0];
  return MAIN_HOSTS.includes(h) || h.endsWith('.workers.dev');
}

export function cleanHostname(v) {
  let h = String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  if (!/^(?=.{4,100}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(h)) return '';
  if (h === 'whitelink.site' || h.endsWith('.whitelink.site')) return '';
  return h;
}

export async function cfReady(env) {
  const s = await getSettings(env);
  return s.cf_token && s.cf_zone ? s : null;
}

async function cf(s, path, method, body) {
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/zones/' + s.cf_zone + '/custom_hostnames' + path, {
      method: method || 'GET',
      headers: { authorization: 'Bearer ' + s.cf_token, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const d = await r.json().catch(() => ({}));
    if (!d.success) return { ok: false, error: ((d.errors || [])[0] || {}).message || 'A Cloudflare não respondeu.', code: ((d.errors || [])[0] || {}).code };
    return { ok: true, result: d.result };
  } catch (e) {
    return { ok: false, error: 'Sem conexão com a Cloudflare.' };
  }
}

function view(row, res) {
  const ssl = (res && res.ssl) || {};
  const status = res ? (res.status === 'active' && ssl.status === 'active' ? 'ativo' : 'aguardando') : row.status;
  // com o CNAME apontando para nós, a Cloudflare confirma o domínio e cria o cadeado sozinha
  const records = [{ type: 'CNAME', name: row.hostname, value: TARGET }];
  return { hostname: row.hostname, status, records, error: (res && ((res.verification_errors || [])[0] || (ssl.validation_errors || [])[0] || {}).message) || '' };
}

export async function domainGet(env, userId, refresh) {
  const row = await env.DB.prepare('SELECT * FROM domains WHERE user_id = ?').bind(userId).first();
  if (!row) return null;
  if (!refresh || row.status === 'ativo') return view(row, null);
  const s = await cfReady(env);
  if (!s || !row.cf_id) return view(row, null);
  const r = await cf(s, '/' + row.cf_id);
  if (!r.ok) return view(row, null);
  const v = view(row, r.result);
  if (v.status !== row.status) await env.DB.prepare('UPDATE domains SET status = ? WHERE user_id = ?').bind(v.status, userId).run();
  return v;
}

export async function domainAdd(env, userId, hostname) {
  const s = await cfReady(env);
  if (!s) return { ok: false, error: 'O domínio próprio ainda não foi ativado no WhiteLink. Fale com o suporte.' };
  const taken = await env.DB.prepare('SELECT user_id FROM domains WHERE hostname = ?').bind(hostname).first();
  if (taken && taken.user_id !== userId) return { ok: false, error: 'Esse domínio já está ligado a outra conta.' };
  await domainRemove(env, userId);
  const r = await cf(s, '', 'POST', { hostname, ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } } });
  if (!r.ok) return { ok: false, error: r.code === 1406 ? 'Esse domínio já está em uso na Cloudflare.' : 'Não conseguimos registrar o domínio: ' + r.error };
  await env.DB.prepare("INSERT INTO domains (user_id, hostname, cf_id, status, created_at) VALUES (?, ?, ?, 'aguardando', ?)").bind(userId, hostname, r.result.id, Date.now()).run();
  return { ok: true, domain: view({ hostname, status: 'aguardando' }, r.result) };
}

export async function domainRemove(env, userId) {
  const row = await env.DB.prepare('SELECT * FROM domains WHERE user_id = ?').bind(userId).first();
  if (!row) return;
  const s = await cfReady(env);
  if (s && row.cf_id) await cf(s, '/' + row.cf_id, 'DELETE');
  await env.DB.prepare('DELETE FROM domains WHERE user_id = ?').bind(userId).run();
}

// Visitante chegou por um domínio de cliente: descobre de quem é
export async function domainOwner(env, host) {
  host = String(host || '').toLowerCase().split(':')[0];
  return env.DB.prepare('SELECT d.user_id, u.handle, u.plan, u.plan_until, u.trial_until, u.status FROM domains d JOIN users u ON u.id = d.user_id WHERE d.hostname = ?').bind(host).first();
}

// Todo dia: tira o domínio de quem saiu do Diamante há mais de 7 dias
export async function domainCleanup(env) {
  const r = await env.DB.prepare('SELECT d.user_id, u.plan, u.plan_until, u.trial_until FROM domains d JOIN users u ON u.id = d.user_id').all();
  const week = 7 * 86400000, now = Date.now();
  for (const x of r.results || []) {
    if (effectivePlan(x).plan === 'diamante') continue;
    const lost = Math.max(x.plan === 'diamante' ? x.plan_until || 0 : 0, x.trial_until || 0);
    if (now - lost > week) await domainRemove(env, x.user_id);
  }
}
