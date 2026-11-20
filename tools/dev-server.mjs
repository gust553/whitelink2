// Servidor local para testes: roda o Worker com um banco SQLite em memória.
// Uso: node --no-warnings tools/dev-server.mjs 8787
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema-console.sql'), 'utf8'));
const DB = { prepare(sql) { const st = { args: [], bind(...a) { st.args = a.map((x) => (x === undefined ? null : x)); return st; },
  async first() { return db.prepare(sql).get(...st.args) ?? null; }, async all() { return { results: db.prepare(sql).all(...st.args) }; },
  async run() { const r = db.prepare(sql).run(...st.args); return { meta: { last_row_id: Number(r.lastInsertRowid) } }; } }; return st; } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const ASSETS = { async fetch(u) {
  let p = decodeURIComponent(new URL(typeof u === 'string' ? u : (u.url || String(u))).pathname);
  const tries = p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html', p + '/index.html'];
  for (const t of tries) { const f = path.join(ROOT, 'public', t); if (f.startsWith(path.join(ROOT, 'public')) && fs.existsSync(f) && fs.statSync(f).isFile()) return new Response(fs.readFileSync(f), { headers: { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' } }); }
  return new Response('not found', { status: 404 });
} };
const worker = (await import(path.join(ROOT, 'src/worker.js'))).default;
const env = { DB, ASSETS };
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
