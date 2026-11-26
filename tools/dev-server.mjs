// Servidor local para testes: roda o Worker com um banco SQLite em memória.
// Uso: node --no-warnings tools/dev-server.mjs 8787
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
// MOCK_CF=1: imita a API de domínios da Cloudflare (só para testes)
if (process.env.MOCK_CF) {
  const real = globalThis.fetch, hosts = {};
  globalThis.fetch = async (u, o = {}) => {
    const url = String(u);
    if (url.startsWith('https://api.mercadopago.com/')) return mockMP(url, o);
    if (/^https:\/\/(api|api-sandbox)\.asaas\.com\/|^https:\/\/(sandbox\.)?api\.pagseguro\.com\/|^https:\/\/api\.pagar\.me\//.test(url)) return mockGW(url, o);
    if (!url.startsWith('https://api.cloudflare.com/')) return real(u, o);
    const ok = (result) => new Response(JSON.stringify({ success: true, result }));
    const id = url.split('/custom_hostnames/')[1];
    if (o.method === 'POST') { const b = JSON.parse(o.body); const h = { id: 'h' + Date.now(), hostname: b.hostname, status: 'pending', checks: 0, ssl: { status: 'pending_validation' }, ownership_verification: { type: 'txt', name: '_cf-custom-hostname.' + b.hostname, value: 'abc-123' } }; hosts[h.id] = h; return ok(h); }
    if (o.method === 'DELETE') { delete hosts[id]; return ok({ id }); }
    const h = hosts[id]; if (!h) return new Response(JSON.stringify({ success: false, errors: [{ message: 'not found' }] }));
    if (++h.checks >= 2) { h.status = 'active'; h.ssl.status = 'active'; }
    return ok(h);
  };
}
// Mercado Pago de teste: token "APP_USR-ok..." funciona, outros dão 401. POST /__dev/mp-pay?id= aprova um pagamento.
const MPAY = {};
globalThis.__MPAY = MPAY;
function mockMP(url, o) {
  const auth = String((o.headers && (o.headers.authorization || o.headers.Authorization)) || '');
  const res = (d, st = 200) => new Response(JSON.stringify(d), { status: st, headers: { 'content-type': 'application/json' } });
  if (!auth.startsWith('Bearer APP_USR-ok') && !auth.startsWith('Bearer TEST-ok')) return res({ message: 'invalid access token', status: 401 }, 401);
  if (url.endsWith('/users/me')) return res({ id: 123, nickname: 'GMDIGITAL', email: 'loja@gm.com', site_id: 'MLB' });
  if (url.endsWith('/v1/payments') && o.method === 'POST') { const b = JSON.parse(o.body); const id = String(9000 + Object.keys(MPAY).length); MPAY[id] = { id, status: 'pending', external_reference: b.external_reference, transaction_amount: b.transaction_amount, payer: { first_name: 'Pagador' }, point_of_interaction: { transaction_data: { qr_code: '00020126MPTESTE' + id, qr_code_base64: '' } } }; return res(MPAY[id], 201); }
  const m = url.match(/\/v1\/payments\/(\d+)/); if (m && MPAY[m[1]]) return res(MPAY[m[1]]);
  return res({ message: 'not found' }, 404);
}
// Asaas, PagBank e Pagar.me de teste. Chaves válidas: $aact_prod_ok… / $aact_hmlg_ok…, ok-pagbank…, sk_ok… / sk_test_ok…
globalThis.__GWLOG = [];
function mockGW(url, o) {
  const H = o.headers || {}, m = (o.method || 'GET').toUpperCase(), body = o.body ? JSON.parse(o.body) : {};
  const res = (d, st = 200) => new Response(JSON.stringify(d), { status: st, headers: { 'content-type': 'application/json' } });
  const nid = (pre) => pre + (9100 + Object.keys(MPAY).length);
  globalThis.__GWLOG.push({ url, m, body });
  if (url.includes('asaas.com')) {
    if (!/^\$aact_(prod|hmlg)_ok/.test(H.access_token || '')) return res({ errors: [{ code: 'invalid_access_token', description: 'A chave de API informada não pertence a este ambiente' }] }, 401);
    if (url.endsWith('/myAccount/commercialInfo')) return res({ name: 'GM DIGITAL LTDA', email: 'asaas@gm.com' });
    if (url.endsWith('/customers') && m === 'POST') return String(body.cpfCnpj || '').length >= 11 ? res({ id: 'cus_000001', name: body.name }) : res({ errors: [{ description: 'O CPF/CNPJ informado é inválido.' }] }, 400);
    if (url.endsWith('/payments') && m === 'POST') { const id = nid('pay_'); MPAY[id] = { id, value: body.value, externalReference: body.externalReference, status: 'PENDING', paid: false }; return res(MPAY[id]); }
    let x = url.match(/\/payments\/([\w]+)\/pixQrCode$/); if (x && MPAY[x[1]]) return res({ payload: '00020126ASAAS' + x[1], encodedImage: '' });
    x = url.match(/\/payments\/([\w]+)$/); if (x && MPAY[x[1]]) { const p = MPAY[x[1]]; return res(Object.assign({}, p, { status: p.paid ? 'RECEIVED' : 'PENDING' })); }
    return res({ errors: [{ description: 'not found' }] }, 404);
  }
  if (url.includes('pagseguro.com')) {
    if (!String(H.authorization || '').startsWith('Bearer ok-pagbank')) return res({ error_messages: [{ description: 'invalid token' }] }, 401);
    if (url.endsWith('/orders') && m === 'POST') { if (!body.customer || String(body.customer.tax_id || '').length < 11) return res({ error_messages: [{ description: 'customer.tax_id inválido' }] }, 400); const id = nid('ORDE_'); MPAY[id] = { id, reference_id: body.reference_id, value: body.qr_codes[0].amount.value, paid: false, sandbox: url.includes('sandbox') }; return res({ id, reference_id: body.reference_id, qr_codes: [{ id: 'QRCO_1', text: '00020126PAGBANK' + id, amount: body.qr_codes[0].amount }] }, 201); }
    const x = url.match(/\/orders\/([\w-]+)$/); if (x && MPAY[x[1]]) { const p = MPAY[x[1]]; return res({ id: p.id, reference_id: p.reference_id, charges: p.paid ? [{ status: 'PAID', amount: { value: p.value } }] : [] }); }
    return res({ error_messages: [{ description: 'not found' }] }, 404);
  }
  const tok = Buffer.from(String(H.authorization || '').replace('Basic ', ''), 'base64').toString();
  if (!/^sk_(test_)?ok/.test(tok)) return res({ message: 'Authorization has been denied for this request.' }, 401);
  if (url.includes('/orders?')) return res({ data: [] });
  if (url.endsWith('/orders') && m === 'POST') { if (!body.customer || String(body.customer.document || '').length < 11) return res({ message: 'The request is invalid.', errors: { 'order.customer.document': ['required'] } }, 422); const id = nid('or_'); MPAY[id] = { id, code: body.code, amount: body.items[0].amount, paid: false }; return res({ id, code: body.code, amount: MPAY[id].amount, status: 'pending', charges: [{ last_transaction: { qr_code: '00020126PAGARME' + id } }] }); }
  const x = url.match(/\/orders\/([\w]+)$/); if (x && MPAY[x[1]]) { const p = MPAY[x[1]]; return res({ id: p.id, code: p.code, amount: p.amount, status: p.paid ? 'paid' : 'pending' }); }
  return res({ message: 'not found' }, 404);
}
// IA de teste (só no servidor local)
const MOCK_AI = { run: async (m, o) => ({ response: JSON.stringify(['Sugestão 1 para: ' + o.messages[1].content.slice(0, 30), 'Sugestão 2', 'Sugestão 3']) }) };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema-console.sql'), 'utf8'));
const DB = { prepare(sql) { const st = { args: [], bind(...a) { st.args = a.map((x) => (x === undefined ? null : x)); return st; },
  async first() { return db.prepare(sql).get(...st.args) ?? null; }, async all() { return { results: db.prepare(sql).all(...st.args) }; },
  async run() { const r = db.prepare(sql).run(...st.args); return { meta: { last_row_id: Number(r.lastInsertRowid) } }; } }; return st; },
  async batch(list) { const out = []; db.exec('BEGIN'); try { for (const st of list) out.push(await st.run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return out; } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const ASSETS = { async fetch(u) {
  let p = decodeURIComponent(new URL(typeof u === 'string' ? u : (u.url || String(u))).pathname);
  const tries = p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html', p + '/index.html'];
  for (const t of tries) { const f = path.join(ROOT, 'public', t); if (f.startsWith(path.join(ROOT, 'public')) && fs.existsSync(f) && fs.statSync(f).isFile()) return new Response(fs.readFileSync(f), { headers: { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' } }); }
  return new Response('not found', { status: 404 });
} };
const worker = (await import(path.join(ROOT, 'src/worker.js'))).default;
const env = { AI: MOCK_AI, DB, ASSETS };
const port = Number(process.argv[2] || 8787);
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  if (req.url.startsWith('/__dev/mp-pay')) { const id = new URL(req.url, 'http://x').searchParams.get('id'); const st = new URL(req.url, 'http://x').searchParams.get('st') || 'approved'; if (MPAY[id]) { MPAY[id].status = st; MPAY[id].paid = st === 'approved'; } res.end(MPAY[id] ? 'ok' : 'nao'); return; }
  if (req.url === '/__dev/q') { try { res.end(JSON.stringify(db.prepare(Buffer.concat(chunks).toString()).all())); } catch (e) { res.end(JSON.stringify({ erro: String(e) })); } return; }
  if (req.url === '/__dev/sql') { try { db.exec(Buffer.concat(chunks).toString()); res.end('ok'); } catch (e) { res.end(String(e)); } return; }
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  headers.set('cf-connecting-ip', '127.0.0.1');
  const url = 'http://' + req.headers.host + req.url;
  const r = await worker.fetch(new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env, { waitUntil() {} });
  const out = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
  const sc = r.headers.getSetCookie().map((c) => c.replace(/; Secure/i, ''));
  if (sc.length) out['set-cookie'] = sc;
  if (out.location) out.location = out.location.replace('https://whitelink.site', '');
  res.writeHead(r.status, out); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log('rodando em http://localhost:' + port));
