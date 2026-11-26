// Benefícios de cada plano — lista única usada no site, em Meu plano, no Pagamento e no admin
window.WL_PLANOS = {
  prata: [
    'Grátis para sempre',
    'Até 3 links',
    'Blocos de link e de texto',
    '2 temas prontos (Noite e Papel)',
    'Total de visitas dos últimos 7 dias',
    'Marca WhiteLink no rodapé da página',
    'Central de ajuda e chat para pagamento e teste grátis'
  ],
  ouro: [
    'Até 10 links',
    'Todos os blocos: produto, vídeo, galeria, contagem regressiva, captura de contatos e Pix',
    '13 temas prontos',
    'Mudar a cor, a fonte e o formato dos botões',
    'Estatísticas de 30 dias: cliques em cada link, de onde veio a visita, aparelho e cidade',
    'Lista dos contatos captados na sua página',
    'Links agendados: aparecem e somem sozinhos',
    'Fixar link no topo e efeitos de destaque (pulsar, tremer, brilhar)',
    'Sem a marca WhiteLink na página',
    'Chat de suporte para qualquer dúvida'
  ],
  diamante: [
    'Tudo do Ouro, e mais:',
    'Links ilimitados',
    'Todos os 77 temas, incluindo os com movimento',
    'Criador de tema: suas cores, fundo, botões e fonte',
    'Teste A/B: dois títulos no mesmo link para ver qual dá mais cliques',
    'Estatísticas de 90 dias e baixar em planilha',
    'Baixar a lista de contatos em planilha',
    'Domínio próprio (ex.: links.seusite.com.br)',
    'Até 3 páginas na mesma conta',
    'Selo de verificado ao lado do nome',
    'Pixel da Meta e Google Analytics',
    'Suporte prioritário'
  ]
};

// CSS do tema criado (Diamante) — o mesmo que a página pública usa
window.WL_customCss = function (c) {
  c = Object.assign({ bg1: '#1b1035', bg2: '#0b0b10', grad: 1, text: '#f3f3f7', btn: '#d4ff3a', btnText: '#0e0e14', style: 0, radius: 1, font: 0 }, c || {});
  var F = ['Space Grotesk', 'Inter', 'Playfair Display', 'DM Serif Display', 'Syne', 'Caveat', 'Bebas Neue', 'Outfit'];
  var g = [c.bg1, 'linear-gradient(180deg,' + c.bg1 + ',' + c.bg2 + ')', 'linear-gradient(135deg,' + c.bg1 + ',' + c.bg2 + ')', 'radial-gradient(circle at 50% 0%,' + c.bg1 + ',' + c.bg2 + ' 70%)'][c.grad];
  var r = ['6px', '16px', '999px'][c.radius];
  var btn = ['background:' + c.btn + ';color:' + c.btnText + ';border:1px solid ' + c.btn, 'background:transparent;color:' + c.text + ';border:2px solid ' + c.btn, 'background:rgba(255,255,255,.12);color:' + c.text + ';border:1px solid rgba(255,255,255,.22);backdrop-filter:blur(10px)'][c.style];
  return '.t-custom{color:' + c.text + ";font-family:'" + F[c.font] + "',sans-serif}.t-custom .ph-bg{background:" + g + '}.t-custom .ph-bg::before,.t-custom .ph-bg::after{display:none}.t-custom .ph-av{background:rgba(255,255,255,.12);border:2px solid ' + c.btn + ';color:' + c.text + '}.t-custom .ph-btn{' + btn + ';border-radius:' + r + '}.t-custom .ph-btn.main{background:' + c.btn + ';color:' + c.btnText + ';border:1px solid ' + c.btn + '}.t-custom .ph-card{background:rgba(255,255,255,.1);border-radius:' + r + ';color:' + c.text + '}.t-custom .ph-orn,.t-custom .ph-tag{display:none}';
};
