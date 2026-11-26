// WhiteLink — anúncio ao entrar no painel (uma vez por dia): novidades e benefícios do próximo plano
(function () {
  var today = new Date().toISOString().slice(0, 10);
  try { if (localStorage.getItem('wl_ann') === today) return; } catch (e) {}
  Promise.all([fetch('/api/me').then(function (r) { return r.json(); }), fetch('/api/announce').then(function (r) { return r.json(); })]).then(function (res) {
    var me = res[0], an = res[1];
    if (!me.ok || !an.ok || !an.on) return;
    var u = me.user || me, W = window.WL_PLANOS || {};
    var days = u.until ? Math.max(0, Math.ceil((u.until - Date.now()) / 86400000)) : 0;
    var lv = u.agency ? 3 : { prata: 0, ouro: 1, diamante: 2 }[u.plan] || 0;
    var c;
    if (u.trial) c = { tag: 'Teste Diamante · ' + days + (days === 1 ? ' dia' : ' dias'), color: '#8FE3FF', title: 'Aproveite tudo liberado', text: 'Você está testando o Diamante. Experimente agora o que mais vende:', items: ['Loja com Pix na hora e cupons', 'Agenda com sinal por Pix', 'Prova social ao vivo: "12 pessoas vendo agora"', 'Parceiros que vendem por você', 'Avisos no celular a cada venda'], cta: 'Garantir o Diamante', href: '/pagamento?p=diamante' };
    else if (lv === 0) c = { tag: 'Seu plano: Prata', color: '#F2C14E', title: 'Comece a vender pelo seu link', text: 'Com o Ouro, seu link vira uma loja e uma agenda:', items: W.ouro ? W.ouro.slice(0, 6) : [], cta: 'Conhecer os planos', href: '/painel/plano' };
    else if (lv === 1) c = { tag: 'Seu plano: Ouro', color: '#8FE3FF', title: 'Libere tudo com o Diamante', text: 'O que você ganha a mais:', items: W.diamante ? W.diamante.slice(1, 7) : [], cta: 'Ir para o Diamante', href: '/pagamento?p=diamante' };
    else c = { tag: u.agency ? 'Plano Agência' : 'Plano Diamante', color: '#D4FF3A', title: 'Dicas para vender mais hoje', text: 'Você tem tudo liberado. Confira se já está usando:', items: ['Turbo: prova social ao vivo e A/B automático', 'Avisos no celular (instale o app)', 'Links de campanha para cada anúncio e grupo', 'Parceiros com link e comissão', 'Análise da IA na aba Números'], cta: 'Abrir ferramentas', href: '/painel/mais' };
    if (an.title || an.text) c.news = { title: an.title, text: an.text };
    show(c);
  }).catch(function () {});

  function el(tag, css, text) { var e = document.createElement(tag); if (css) e.setAttribute('style', css); if (text != null) e.textContent = text; return e; }
  function show(c) {
    var w = el('div', 'position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:18px;animation:hpF .2s');
    w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-label', 'Novidades do WhiteLink');
    var b = el('div', 'width:100%;max-width:420px;max-height:90vh;overflow:auto;background:linear-gradient(180deg,#1A1A24,#121218);border:1px solid #2A2A36;border-radius:26px;padding:22px;color:#F3F3F7;font:15px Inter,system-ui,sans-serif;animation:hpU .25s cubic-bezier(.2,.8,.2,1);position:relative');
    var x = el('button', 'position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:50%;border:none;background:#24242E;color:#F3F3F7;font-size:18px;cursor:pointer', '×'); x.setAttribute('aria-label', 'Fechar');
    b.appendChild(x);
    if (c.news) {
      var n = el('div', 'padding:14px;border-radius:16px;background:rgba(212,255,58,.08);border:1px solid #34411A;margin:0 0 16px');
      if (c.news.title) n.appendChild(el('b', 'display:block;color:#D4FF3A;font-size:15px;margin-bottom:4px', '📣 ' + c.news.title));
      if (c.news.text) n.appendChild(el('div', 'font-size:14px;line-height:1.5;color:#D2D2DD', c.news.text));
      b.appendChild(n);
    }
    b.appendChild(el('span', 'display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;background:' + c.color + '22;color:' + c.color, c.tag));
    b.appendChild(el('h3', 'margin:12px 0 6px;font:700 23px/1.15 "Space Grotesk",Inter,sans-serif', c.title));
    b.appendChild(el('p', 'margin:0 0 12px;color:#C9C9D6;font-size:14.5px', c.text));
    var ul = el('ul', 'list-style:none;margin:0 0 18px;padding:0;display:flex;flex-direction:column;gap:9px');
    c.items.forEach(function (t) { var li = el('li', 'display:flex;gap:10px;font-size:14px;line-height:1.45;color:#E2E2EA'); li.appendChild(el('span', 'color:#D4FF3A;font-weight:700', '✓')); li.appendChild(el('span', '', t)); ul.appendChild(li); });
    b.appendChild(ul);
    var go = el('a', 'display:flex;align-items:center;justify-content:center;height:52px;border-radius:999px;background:#D4FF3A;color:#0E0E14;font-weight:700;text-decoration:none', c.cta); go.href = c.href;
    var later = el('button', 'width:100%;height:46px;margin-top:8px;border-radius:999px;border:none;background:none;color:#A7A7B8;font:600 14px Inter,sans-serif;cursor:pointer', 'Agora não');
    b.appendChild(go); b.appendChild(later); w.appendChild(b);
    var close = function () { try { localStorage.setItem('wl_ann', today); } catch (e) {} w.remove(); };
    x.onclick = later.onclick = close; go.addEventListener('click', function () { try { localStorage.setItem('wl_ann', today); } catch (e) {} });
    w.addEventListener('click', function (e) { if (e.target === w) close(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
    document.body.appendChild(w); go.focus();
  }
})();
