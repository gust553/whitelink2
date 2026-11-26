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
