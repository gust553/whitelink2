// Separa o temas.css por tema, para a página pública mandar só o CSS do tema usado
import fs from 'node:fs';
export function splitTemas(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const base = [], per = {}, kf = {};
  const add = (tk, s) => { (per[tk] = per[tk] || []).push(s); };
  function block(str, i) { // devolve o índice do } que fecha o { em i
    let d = 0;
    for (let j = i; j < str.length; j++) { if (str[j] === '{') d++; else if (str[j] === '}') { d--; if (!d) return j; } }
    return str.length - 1;
  }
  function walk(str, wrap) {
    let i = 0;
    while (i < str.length) {
      const o = str.indexOf('{', i); if (o < 0) break;
      const head = str.slice(i, o).trim(); const c = block(str, o); const body = str.slice(o + 1, c);
      i = c + 1;
      if (/^@keyframes/.test(head)) { kf[head.split(/\s+/)[1]] = head + '{' + body + '}'; continue; }
      if (/^@(media|supports)/.test(head)) { walk(body, (x) => (wrap ? wrap(head + '{' + x + '}') : head + '{' + x + '}')); continue; }
      if (/^@/.test(head)) { base.push(head + '{' + body + '}'); continue; }
      const sels = head.split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);
      const out = (sel, list) => { const r = sel.join(',') + '{' + body.trim() + '}'; list(wrap ? wrap(r) : r); };
      const plain = sels.filter((x) => !/\.t-[a-z0-9-]+/.test(x));
      if (plain.length) out(plain, (r) => base.push(r));
      const byTk = {};
      for (const x of sels) for (const m of x.matchAll(/\.t-([a-z0-9-]+)/g)) (byTk[m[1]] = byTk[m[1]] || new Set()).add(x);
      for (const tk in byTk) out([...byTk[tk]], (r) => add(tk, r));
    }
  }
  walk(css, null);
  const withKf = (txt) => { let k = ''; for (const n in kf) if (new RegExp('[\\s:,]' + n.replace(/[-]/g, '\\-') + '(?![\\w-])').test(txt)) k += kf[n]; return txt + k; };
  const themes = {}; for (const tk in per) themes[tk] = withKf(per[tk].join(''));
  return { base: withKf(base.join('')), themes };
}
if (process.argv[1] && process.argv[1].endsWith('split-temas.mjs')) {
  const r = splitTemas(fs.readFileSync('public/assets/temas.css', 'utf8'));
  console.log('base', r.base.length, 'temas', Object.keys(r.themes).length, 'maior', Math.max(...Object.values(r.themes).map((x) => x.length)));
}
