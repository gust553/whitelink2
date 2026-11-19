// Funções comuns do WhiteLink (rodam nas Cloudflare Functions)

export const DAY = 86400000;
export const TRIAL_DAYS = 3;
export const SESSION_DAYS = 30;
export const PLAN_LIMITS = { prata: 3, ouro: 10, diamante: 0 }; // 0 = ilimitado

export const RESERVED = new Set([
  'api', 'admin', 'entrar', 'painel', 'ajuda', 'termos', 'privacidade', 'planos', 'assets',
  'pagamento', 'login', 'cadastro', 'suporte', 'whitelink', 'www', 'app', 'site', 'static',
  'favicon', 'robots', 'sitemap', 'convite', 'conta', 'config', 'configuracoes'
]);

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

export function fail(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, status);
}

export async function readJson(request) {
  try {
    const t = await request.text();
    if (t.length > 20000) return null;
    return JSON.parse(t || '{}');
  } catch (e) {
    return null;
  }
}

const enc = new TextEncoder();

export function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
}

export function randomCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, '0');
}

export async function sha256(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(String(text))));
}

// Senha: PBKDF2-SHA256 com sal aleatório
export async function hashPassword(password, saltHex) {
  const salt = saltHex || randomHex(16);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return { hash: toHex(bits), salt };
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- validação ----------
export function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120 ? e : '';
}

export function cleanPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  // DDD (2) + número de celular (9 dígitos começando com 9)
  return /^[1-9][0-9]9\d{8}$/.test(d) ? '55' + d : '';
}

export function cleanHandle(v) {
  const h = String(v || '').trim().toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9._]{3,30}$/.test(h)) return '';
  if (h.startsWith('.') || h.endsWith('.') || h.includes('..')) return '';
  return RESERVED.has(h) ? '' : h;
}

export function cleanInstagram(v) {
  const h = String(v || '').trim().toLowerCase().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '');
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : '';
}

export function cleanText(v, max = 80) {
  return String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

export function cleanUrl(v) {
  let u = String(v || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const x = new URL(u);
    if (x.protocol !== 'http:' && x.protocol !== 'https:') return '';
    return x.toString().slice(0, 600);
  } catch (e) {
    return '';
  }
}

export function passwordOk(p) {
  const s = String(p || '');
  return s.length >= 8 && s.length <= 100 && /[a-zA-Z]/.test(s) && /\d/.test(s);
}

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------- cookies e sessão ----------
export function getCookie(request, name) {
  const h = request.headers.get('cookie') || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

export function cookie(name, value, maxAgeSec) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || '0.0.0.0';
}

export async function createSession(env, request, userId) {
  const token = randomHex(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, ua) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now + SESSION_DAYS * DAY, clientIp(request), (request.headers.get('user-agent') || '').slice(0, 200))
    .run();
  return cookie('wl_s', token, SESSION_DAYS * 86400);
}

export async function currentUser(env, request) {
  const token = getCookie(request, 'wl_s');
  if (!token || token.length !== 64) return null;
  const row = await env.DB.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'
  ).bind(await sha256(token), Date.now()).first();
  if (!row || row.status === 'bloqueado') return null;
  return row;
}

// Plano que vale agora: teste Diamante > plano pago em dia > Prata
export function effectivePlan(u, now = Date.now()) {
  if (u.trial_until && u.trial_until > now) return { plan: 'diamante', trial: true, until: u.trial_until };
  if (u.plan !== 'prata' && u.plan_until && u.plan_until > now) return { plan: u.plan, trial: false, until: u.plan_until };
  return { plan: 'prata', trial: false, until: null };
}

export function publicUser(u) {
  const p = effectivePlan(u);
  return {
    name: u.name, email: u.email, handle: u.handle, instagram: u.instagram,
    phoneEnd: String(u.phone).slice(-4),
    plan: p.plan, trial: p.trial, until: p.until,
    limit: PLAN_LIMITS[p.plan], refCode: u.ref_code, isAdmin: !!u.is_admin
  };
}

// ---------- limite de tentativas ----------
export async function rateLimit(env, key, max, windowMs) {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT window_start, count FROM rate_limits WHERE key = ?').bind(key).first();
  if (!row || now - row.window_start > windowMs) {
    await env.DB.prepare('INSERT OR REPLACE INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)').bind(key, now).run();
    return true;
  }
  if (row.count >= max) return false;
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
  return true;
}

// ---------- SMS ----------
// Enquanto nenhuma empresa de SMS estiver configurada (variável SMS_MODE diferente de "real"),
// o código aparece na tela, com aviso de modo teste. Nunca deixe assim depois de lançar.
export async function sendSms(env, phone, text) {
  if (env.SMS_MODE !== 'real') return { ok: true, test: true };
  try {
    const r = await fetch(env.SMS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.SMS_TOKEN },
      body: JSON.stringify({ to: '+' + phone, message: text })
    });
    return { ok: r.ok, test: false };
  } catch (e) {
    return { ok: false, test: false };
  }
}

export async function issueCode(env, phone, purpose, payload) {
  const code = randomCode();
  const id = randomHex(16);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sms_codes (id, phone, purpose, code_hash, payload, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, phone, purpose, await sha256(id + ':' + code), payload ? JSON.stringify(payload) : null, now + 15 * 60000, now).run();
  const sms = await sendSms(env, phone, `WhiteLink: seu codigo e ${code}. Nao passe para ninguem.`);
  return { id, sms, code };
}

export async function checkCode(env, id, code, purpose) {
  const row = await env.DB.prepare('SELECT * FROM sms_codes WHERE id = ? AND purpose = ?').bind(String(id || ''), purpose).first();
  if (!row || row.used || row.expires_at < Date.now()) return { ok: false, error: 'Código vencido. Peça um novo.' };
  if (row.attempts >= 5) return { ok: false, error: 'Muitas tentativas. Peça um novo código.' };
  const good = safeEqual(await sha256(row.id + ':' + String(code || '').replace(/\D/g, '')), row.code_hash);
  if (!good) {
    await env.DB.prepare('UPDATE sms_codes SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
    return { ok: false, error: 'Código errado. Confira e tente de novo.' };
  }
  await env.DB.prepare('UPDATE sms_codes SET used = 1 WHERE id = ?').bind(row.id).run();
  return { ok: true, row };
}

export function codeReply(issued, extra = {}) {
  const out = { ok: true, codeId: issued.id, ...extra };
  if (issued.sms.test) { out.testMode = true; out.testCode = issued.code; }
  if (!issued.sms.ok) return { ok: false, error: 'Não conseguimos enviar o SMS agora. Tente de novo em alguns minutos.' };
  return out;
}
