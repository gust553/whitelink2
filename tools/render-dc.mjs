// Converte uma tela do protótipo (.dc.html) em HTML estático, no estado inicial.
// Uso: node tools/render-dc.mjs Arquivo.dc.html > saida.html
import fs from 'node:fs';
const src = fs.readFileSync(process.argv[2], 'utf8');
const LINKS = JSON.parse(process.argv[3] || '{}');
const helmet = (src.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1];
const tpl = src.split('</helmet>')[1].split('</x-dc>')[0];
const title = (src.match(/<title>([\s\S]*?)<\/title>/) || [, 'WhiteLink'])[1];
const code = src.slice(src.indexOf('class Component'), src.lastIndexOf('</script>'));
class DCLogic { constructor(p) { this.props = p || {}; this.state = {}; } setState(o) { Object.assign(this.state, o); } }
const C = new Function('DCLogic', code + '\nreturn Component;')(DCLogic);
const inst = new C({});
const vals = inst.renderVals();

// árvore só com sc-for / sc-if
function parse(s) {
  const re = /<(\/?)(sc-for|sc-if)\b([^>]*)>/g;
  const root = { kids: [] }; const stack = [root]; let last = 0, m;
  while ((m = re.exec(s))) {
    const top = stack[stack.length - 1];
    top.kids.push(s.slice(last, m.index)); last = re.lastIndex;
    if (m[1]) { stack.pop(); continue; }
    const attrs = {}; m[3].replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => (attrs[k] = v));
    const node = { tag: m[2], attrs, kids: [] }; top.kids.push(node); stack.push(node);
  }
  root.kids.push(s.slice(last)); return root;
}
const ev = (expr, scope) => { try { return new Function('__s', 'with(__s){return (' + expr + ')}')(scope); } catch (e) { return undefined; } };
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function fill(text, scope) {
  // atributos de evento: remove
  text = text.replace(/\s(on[A-Z]\w*)="\{\{[^}]*\}\}"/g, '');
  // atributos booleanos
  text = text.replace(/\s(checked|disabled|selected|readonly|hidden)="\{\{([^}]*)\}\}"/g, (_, a, e) => (ev(e.trim(), scope) ? ' ' + a : ''));
  text = text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, e) => { const v = ev(e, scope); return v == null || typeof v === 'function' ? '' : esc(v); });
  // links entre telas do protótipo → rotas do site
  text = text.replace(/href="([A-Za-z]+\.dc\.html)([^"]*)"/g, (_, f, rest) => 'href="' + (LINKS[f] || '#') + rest + '"');
  return text;
}
function render(node, scope) {
  return node.kids.map((k) => {
    if (typeof k === 'string') return fill(k, scope);
    const expr = (k.attrs.list || k.attrs.value || '').replace(/^\{\{\s*|\s*\}\}$/g, '');
    const v = ev(expr, scope);
    if (k.tag === 'sc-if') return v ? render(k, scope) : '';
    if (!Array.isArray(v)) return '';
    return v.map((it) => render(k, Object.assign(Object.create(scope), { [k.attrs.as]: it }))).join('');
  }).join('');
}
const body = render(parse(tpl), vals);
process.stdout.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
${helmet}
</head>
<body>
${body}
</body>
</html>
`);
