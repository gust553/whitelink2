// Avisos no celular (Web Push com criptografia aes128gcm e VAPID), sem serviço externo.
import { getSettings, setSettings } from './billing.js';
import { effectivePlan, PLAN_LEVEL } from './lib.js';

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const concat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { out.set(x, i); i += x.length; } return out; };

export async function vapidKeys(env) {
  const s = await getSettings(env);
  if (s.vapid_pub && s.vapid_priv) return { pub: s.vapid_pub, priv: JSON.parse(s.vapid_priv) };
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  await setSettings(env, { vapid_pub: pub, vapid_priv: JSON.stringify(priv) });
  return { pub, priv };
}

async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

async function encrypt(sub, payload) {
  const uaPub = unb64u(sub.p256dh), auth = unb64u(sub.auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, rs, new Uint8Array([65]), asPub, ct);
}

async function vapidHeader(env, endpoint) {
  const { pub, priv } = await vapidKeys(env);
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://whitelink.site' })));
  const key = await crypto.subtle.importKey('jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body)));
  return 'vapid t=' + head + '.' + body + '.' + sig + ', k=' + pub;
}

export async function sendPush(env, sub, data) {
  const body = await encrypt(sub, JSON.stringify(data));
  const r = await fetch(sub.endpoint, { method: 'POST', headers: { 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'high', authorization: await vapidHeader(env, sub.endpoint) }, body });
  if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(sub.endpoint).run();
  return r.status;
}

// Ouro: avisos de contato. Diamante: todos (vendas, agendamentos, apoios, publis…)
export async function pushTo(env, userId, kind, text, url) {
  const u = await env.DB.prepare('SELECT plan, plan_until, trial_until FROM users WHERE id = ?').bind(userId).first();
  if (!u) return;
  const lvl = PLAN_LEVEL[effectivePlan(u).plan];
  if (lvl < 1 || (lvl === 1 && kind !== 'contato')) return;
  const subs = (await env.DB.prepare('SELECT * FROM push_subs WHERE user_id = ? LIMIT 10').bind(userId).all()).results || [];
  const title = { contato: 'Novo contato', pedido: 'Novo pedido 🛍', agendamento: 'Novo agendamento 📅', apoio: 'Novo apoio 💛', publi: 'Proposta de publi 🤝', otimizacao: 'Sua página melhorou ✨' }[kind] || 'WhiteLink';
  for (const s of subs) { try { await sendPush(env, s, { title, body: text, url: url || '/painel' }); } catch (e) {} }
}
export { encrypt as _encrypt, vapidHeader as _vapid };
