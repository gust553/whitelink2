// Benefícios de cada plano — lista única usada no site, em Meu plano, no Pagamento e no admin
window.WL_PLANOS = {
  prata: [
    'Grátis para sempre',
    'Até 3 links',
    'Blocos de link e de texto',
    '2 temas prontos e foto de perfil',
    'Total de visitas dos últimos 7 dias',
    'Marca WhiteLink no rodapé',
    'Central de ajuda'
  ],
  ouro: [
    'Até 10 links e todos os blocos: vídeo, produto, galeria, contagem, captura e Pix',
    'Loja com até 10 produtos e pedido direto no seu WhatsApp',
    'Agenda de horários com 1 serviço',
    'Apoios com meta na página',
    'Quiz que indica produto (1 quiz)',
    'Mídia kit com pedido de publi',
    'Lista de clientes com histórico',
    'Foto de capa e animações de entrada',
    '13 temas, cores, fonte e formato dos botões',
    'Estatísticas de 30 dias: cliques, origem, aparelho e cidade',
    'Links abrem direto no app (YouTube, Instagram, WhatsApp…)',
    'Links agendados, fixar no topo e efeitos de destaque',
    'QR code com suas cores e sua foto',
    'Assistente de IA: 20 pedidos por mês',
    'Aviso no celular a cada novo contato',
    'Sem a marca WhiteLink e chat de suporte'
  ],
  diamante: [
    'Tudo do Ouro, e mais:',
    'Links ilimitados e até 3 páginas',
    'Loja ilimitada com Pix na hora, cupons e frete',
    'Agenda com vários serviços, folgas e sinal por Pix',
    'Ranking e mensagens dos apoiadores',
    'Quizzes ilimitados',
    'CRM completo: etapas, etiquetas, anotações e planilha',
    'Campanhas por WhatsApp para grupos de clientes',
    'Parceiros (afiliados) com link próprio e comissão',
    'Mídia kit completo com seus números reais e PDF',
    'Prova social ao vivo: "12 pessoas vendo agora"',
    'Otimização automática: o A/B decide sozinho e os links se reorganizam',
    'Links inteligentes por aparelho e horário',
    'Links de campanha com relatório',
    'Horários de pico e estatísticas de 90 dias com planilha',
    'Assistente de IA: 500 pedidos por mês e análise da página',
    'Avisos no celular de cada venda, agendamento e apoio',
    'Os 77 temas, criador de tema e capa em vídeo',
    'Domínio próprio, selo de verificado, Pixel e Google Analytics',
    'Suporte prioritário'
  ],
  agencia: [
    'Tudo do Diamante, e mais:',
    'Até 20 páginas: uma para cada cliente',
    'Relatório para marcas com link para compartilhar',
    'Mídia kit e números de cada página',
    'Ideal para agências, assessorias e gestores de criadores'
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
