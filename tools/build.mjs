// Gera as páginas do site (pasta public) a partir das telas do protótipo (pasta screens).
// Rodar: node tools/build.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const soon = (t) => '/painel/em-breve?t=' + encodeURIComponent(t);

export const LINKS = {
  'Main.dc.html': '/', 'Entrar.dc.html': '/entrar', 'Teste.dc.html': '/entrar#cadastro',
  'Editor.dc.html': '/painel', 'Temas.dc.html': soon('Temas'), 'CriadorTema.dc.html': soon('Criador de tema'),
  'Agenda.dc.html': soon('Agendamentos'), 'Stats.dc.html': soon('Estatísticas'), 'Contatos.dc.html': '/painel/contatos',
  'Configuracoes.dc.html': '/painel/configuracoes', 'Indique.dc.html': soon('Indique e ganhe'), 'MeuPlano.dc.html': '/painel/plano',
  'Conta.dc.html': soon('Minha conta'), 'EditarLink.dc.html': '/painel/editar-link', 'Pagamento.dc.html': '/pagamento',
  'ConfirmarPagamento.dc.html': '/pagamento/confirmar', 'CentralAjuda.dc.html': '/ajuda', 'SuporteCliente.dc.html': '/ajuda',
  'Recibo.dc.html': '/painel/recibo', 'Termos.dc.html': '/termos', 'Privacidade.dc.html': '/privacidade',
  'Planos.dc.html': '/#precos', 'PaginaPublica.dc.html': '/', 'PaginaFechada.dc.html': '/'
};

// tela → [arquivo de saída, precisa de login?, é prévia com dados de exemplo?]
const PAGES = {
  'Main.dc.html': ['index.html', false, false],
  'Editor.dc.html': ['painel.html', true, false],
  'Contatos.dc.html': ['painel/contatos.html', true, true],
  'Configuracoes.dc.html': ['painel/configuracoes.html', true, true],
  'MeuPlano.dc.html': ['painel/plano.html', true, true],
  'EditarLink.dc.html': ['painel/editar-link.html', true, true],
  'Recibo.dc.html': ['painel/recibo.html', true, true],
  'Pagamento.dc.html': ['pagamento.html', true, true],
  'ConfirmarPagamento.dc.html': ['pagamento/confirmar.html', true, true],
  'CentralAjuda.dc.html': ['ajuda.html', false, false],
  'Termos.dc.html': ['termos.html', false, false],
  'Privacidade.dc.html': ['privacidade.html', false, false]
};

const PREVIEW_BAR = `<div style="position:sticky;top:0;z-index:50;background:#2B2210;border-bottom:1px solid #4A3A14;color:#F7DFA0;font:500 13px Inter,sans-serif;padding:8px 16px;text-align:center">Prévia: esta tela ainda mostra dados de exemplo. Ela será ligada à sua conta nas próximas atualizações. <a href="/painel" style="color:#D4FF3A">Voltar ao editor</a></div>`;

function build(file, [out, login, preview]) {
  const src = fs.readFileSync(path.join(ROOT, 'screens', file), 'utf8');
  const helmet = (src.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1];
  const tpl = src.split('</helmet>')[1].split('</x-dc>')[0];
  const title = (src.match(/<title>([\s\S]*?)<\/title>/) || [, 'WhiteLink'])[1];
  const code = src.slice(src.indexOf('class Component'), src.lastIndexOf('</script>'));
  const props = (() => { try { const m = src.match(/data-props='([^']*)'/); const p = JSON.parse(m[1]); const o = {}; for (const k in p) if (k[0] !== '$' && p[k] && p[k].default !== undefined) o[k] = p[k].default; return o; } catch (e) { return {}; } })();
  const guard = login ? `(async()=>{const d=await DC.api('me');if(d.status===401)location.href='/entrar';})();` : '';
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
${login ? '<meta name="robots" content="noindex">' : ''}
${helmet.trim()}
</head>
<body>
${preview ? PREVIEW_BAR : ''}
<div id="root"></div>
<script>window.DC_LINKS=${JSON.stringify(LINKS)};</script>
<script src="/assets/dc.js"></script>
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

for (const [f, cfg] of Object.entries(PAGES)) {
  if (fs.existsSync(path.join(ROOT, 'screens', f))) build(f, cfg);
  else console.log('falta', f);
}
