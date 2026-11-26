// Gera as páginas do site (pasta public) a partir das telas do protótipo (pasta screens).
// Rodar: node tools/build.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const soon = (t) => '/painel/em-breve?t=' + encodeURIComponent(t);

export const LINKS = {
  'Main.dc.html': '/', 'Entrar.dc.html': '/entrar', 'Teste.dc.html': '/entrar#cadastro',
  'Editor.dc.html': '/painel', 'Aparencia.dc.html': '/painel/aparencia', 'Temas.dc.html': '/painel/temas', 'CriadorTema.dc.html': '/painel/criador-tema',
  'Agenda.dc.html': '/painel/agendamentos', 'Stats.dc.html': '/painel/estatisticas', 'Contatos.dc.html': '/painel/contatos',
  'Configuracoes.dc.html': '/painel/configuracoes', 'Indique.dc.html': '/painel/indique', 'MeuPlano.dc.html': '/painel/plano',
  'Conta.dc.html': '/painel/conta', 'EditarLink.dc.html': '/painel', 'Pagamento.dc.html': '/pagamento',
  'ConfirmarPagamento.dc.html': '/pagamento/confirmar', 'CentralAjuda.dc.html': '/ajuda', 'SuporteCliente.dc.html': '/painel/suporte',
  'Recibo.dc.html': '/painel/recibo', 'Termos.dc.html': '/termos', 'Privacidade.dc.html': '/privacidade',
  'Planos.dc.html': '/#precos', 'PaginaPublica.dc.html': '/', 'PaginaFechada.dc.html': '/'
};

// tela → [arquivo de saída, precisa de login?, é prévia com dados de exemplo?, aba do app, título da barra]
const PAGES = {
  'Main.dc.html': ['index.html', false, false],
  'Editor.dc.html': ['painel.html', true, false, 'pagina', null],
  'Aparencia.dc.html': ['painel/aparencia.html', true, false, 'aparencia', null],
  'Mais.dc.html': ['painel/mais.html', true, false, 'mais', null],
  'Temas.dc.html': ['painel/temas.html', true, false, 'aparencia', null],
  'Contatos.dc.html': ['painel/contatos.html', true, false, 'contatos', null],
  'Configuracoes.dc.html': ['painel/configuracoes.html', true, false, 'mais', null],
  'Stats.dc.html': ['painel/estatisticas.html', true, false, 'stats', null],
  'Agenda.dc.html': ['painel/agendamentos.html', true, false, 'mais', null],
  'Indique.dc.html': ['painel/indique.html', true, false, 'mais', null],
  'Conta.dc.html': ['painel/conta.html', true, false, 'mais', null],
  'SuporteCliente.dc.html': ['painel/suporte.html', true, false, 'mais', null],
  'CriadorTema.dc.html': ['painel/criador-tema.html', true, false, 'aparencia', null],
  'Admin.dc.html': ['admin.html', true, false, 'admin', null],
  'MeuPlano.dc.html': ['painel/plano.html', true, false, 'mais', null],
  'Recibo.dc.html': ['painel/recibo.html', true, false, 'mais', null],
  'Pagamento.dc.html': ['pagamento.html', true, false, 'mais', null],
  'ConfirmarPagamento.dc.html': ['pagamento/confirmar.html', true, false, 'mais', null],
  'CentralAjuda.dc.html': ['ajuda.html', false, false],
  'Termos.dc.html': ['termos.html', false, false],
  'Privacidade.dc.html': ['privacidade.html', false, false]
};

const ICONS = {
  pagina: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  aparencia: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.3-1-1.7-1-2.9 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11.5" r="1.1"/><circle cx="10.5" cy="7.5" r="1.1"/><circle cx="15.2" cy="8" r="1.1"/>',
  stats: '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
  contatos: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 15c2 .6 3.4 2.3 3.8 5"/>',
  mais: '<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>'
};
export const TABS = [
  ['pagina', 'Página', '/painel'], ['aparencia', 'Aparência', '/painel/aparencia'], ['stats', 'Estatísticas', '/painel/estatisticas'],
  ['contatos', 'Contatos', '/painel/contatos'], ['mais', 'Mais', '/painel/mais']
];
export function shellNav(active) {
  const svg = (k) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[k] + '</svg>';
  const tabs = TABS.map(([k, n, h]) => `<a class="tab${k === active ? ' on' : ''}" href="${h}"${k === active ? ' aria-current="page"' : ''}><span class="pill">${svg(k)}</span>${n}</a>`).join('');
  const rail = TABS.map(([k, n, h]) => `<a class="rail-i${k === active ? ' on' : ''}" href="${h}"${k === active ? ' aria-current="page"' : ''}><span class="pill">${svg(k)}</span>${n}</a>`).join('');
  return `<nav class="rail" aria-label="Menu"><a class="rail-logo" href="/painel" aria-label="WhiteLink">W</a>${rail}</nav>\n<nav class="tabbar" aria-label="Menu">${tabs}</nav>`;
}

const PREVIEW_BAR = `<div style="position:sticky;top:0;z-index:50;background:#2B2210;border-bottom:1px solid #4A3A14;color:#F7DFA0;font:500 13px Inter,sans-serif;padding:8px 16px;text-align:center">Prévia: esta tela ainda mostra dados de exemplo. Ela será ligada à sua conta nas próximas atualizações. <a href="/painel" style="color:#D4FF3A">Voltar ao editor</a></div>`;

function build(file, [out, login, preview, tab, barTitle]) {
  const src = fs.readFileSync(path.join(ROOT, 'screens', file), 'utf8');
  const helmet = (src.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1];
  let tpl = src.split('</helmet>')[1].split('</x-dc>')[0];
  // telas antigas do protótipo dentro do app: tira o menu de cima e põe a barra do app
  if (tab && barTitle) tpl = tpl.replace(/<header[\s\S]*?<\/header>/, `<div class="appbar"><a class="icon-btn" href="/painel/mais" aria-label="Voltar"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${barTitle}</h1></div>`);
  const title = (src.match(/<title>([\s\S]*?)<\/title>/) || [, 'WhiteLink'])[1];
  const code = src.slice(src.indexOf('class Component'), src.lastIndexOf('</script>'));
  const props = (() => { try { const m = src.match(/data-props='([^']*)'/); const p = JSON.parse(m[1]); const o = {}; for (const k in p) if (k[0] !== '$' && p[k] && p[k].default !== undefined) o[k] = p[k].default; return o; } catch (e) { return {}; } })();
  const guard = login ? `(async()=>{const d=await DC.api('me');if(d.status===401)location.href='/entrar?next='+encodeURIComponent(location.pathname+location.search);})();` : '';
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
${login ? '<meta name="robots" content="noindex">' : ''}
${helmet.trim()}
${tab ? '<link rel="stylesheet" href="/assets/shell.css">' : ''}
</head>
<body${tab ? ' class="has-shell"' : ''}>
${preview ? PREVIEW_BAR : ''}
<div id="root"></div>
${tab && tab !== 'admin' ? shellNav(tab) : ''}
<script>window.DC_LINKS=${JSON.stringify(LINKS)};</script>
<script src="/assets/dc.js"></script>
${tab ? '<script src="/assets/temas-list.js"></script>' : ''}
<script src="/assets/planos.js"></script>
<script>
${code.replace(/<\/script/gi, '<\\/script')}
DC.mount(document.getElementById('root'), ${JSON.stringify(tpl).replace(/<\/script/gi, '<\\/script')}, Component, ${JSON.stringify(props)});
${guard}
</script>
</body>
</html>
`;
  const dest = path.join(ROOT, 'public', out);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
  console.log('ok', file, '→', out);
}

if (process.argv[1] && process.argv[1].endsWith('build.mjs')) {
  const { TEMAS } = await import(path.join(ROOT, 'src/temas.js'));
  fs.writeFileSync(path.join(ROOT, 'public/assets/temas-list.js'), 'window.WL_TEMAS=' + JSON.stringify(TEMAS) + ';\n');
}
if (process.argv[1] && process.argv[1].endsWith('build.mjs')) for (const [f, cfg] of Object.entries(PAGES)) {
  if (fs.existsSync(path.join(ROOT, 'screens', f))) build(f, cfg);
  else console.log('falta', f);
}

// página "em breve" com a mesma estrutura de app
if (process.argv[1] && process.argv[1].endsWith('build.mjs')) {
  fs.writeFileSync(path.join(ROOT, 'public/painel/em-breve.html'), `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Em breve — WhiteLink</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap">
<link rel="stylesheet" href="/assets/shell.css">
</head>
<body class="has-shell">
<div class="appbar"><a class="icon-btn" href="/painel/mais" aria-label="Voltar"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1 id="t">Em breve</h1></div>
<div class="app-main" style="text-align:center;padding-top:60px">
  <div style="width:72px;height:72px;border-radius:24px;background:rgba(212,255,58,.14);color:#D4FF3A;display:flex;align-items:center;justify-content:center;margin:0 auto 18px"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
  <h2 style="margin:0 0 8px;font:700 22px 'Space Grotesk'">Chegando em breve</h2>
  <p style="color:#9C9CAD;font-size:15px;line-height:1.5;margin:0 auto 22px;max-width:340px">Esta parte do painel já está desenhada e chega nas próximas atualizações do WhiteLink.</p>
  <a class="btn" href="/painel">Voltar para minha página</a>
</div>
${shellNav('mais')}
<script>var t=new URLSearchParams(location.search).get('t');if(t){document.getElementById('t').textContent=t;document.title=t+' — WhiteLink';}</script>
</body>
</html>
`);
  console.log('ok em-breve');
}
