// WhiteLink — loja, agenda, apoio e quiz na página pública
(function () {
  var el = document.getElementById('wl-data');
  if (!el) return;
  var D = JSON.parse(el.textContent);
  var cart = {};
  try { cart = JSON.parse(sessionStorage.getItem('wl_cart_' + D.h) || '{}'); } catch (e) {}
  var brl = function (c) { return 'R$ ' + (c / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var api = function (path, body) {
    return fetch('/api/pub/' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ h: D.h }, body)) } : undefined)
      .then(function (r) { return r.json(); }).catch(function () { return { ok: false, error: 'Sem conexão. Tente de novo.' }; });
  };

  // ---------- estilo das janelas ----------
  var css = document.createElement('style');
  css.textContent = '.wls{position:fixed;inset:0;z-index:99;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;animation:wlsF .2s}' +
    '@keyframes wlsF{from{opacity:0}}@keyframes wlsU{from{transform:translateY(40px);opacity:.5}}' +
    '.wlsb{width:100%;max-width:520px;max-height:90vh;overflow:auto;background:#15151C;color:#F3F3F7;border-radius:24px 24px 0 0;padding:18px 18px calc(22px + env(safe-area-inset-bottom));font:15px Inter,system-ui,sans-serif;animation:wlsU .25s cubic-bezier(.2,.8,.2,1)}' +
    '.wlsb h3{margin:4px 0 14px;font:700 20px "Space Grotesk",Inter,sans-serif}.wlsb .x{float:right;background:#24242E;border:none;color:#F3F3F7;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer}' +
    '.wlsb input,.wlsb textarea{width:100%;box-sizing:border-box;height:50px;border-radius:14px;border:1px solid #2E2E3A;background:#0E0E14;color:#F3F3F7;padding:0 14px;font:15px Inter,sans-serif;margin:0 0 10px}.wlsb textarea{height:80px;padding:12px 14px}' +
    '.wlb{width:100%;height:52px;border-radius:999px;border:none;background:#D4FF3A;color:#0E0E14;font:700 16px Inter,sans-serif;cursor:pointer;margin-top:4px;display:flex;align-items:center;justify-content:center;text-decoration:none}.wlb.g{background:#24242E;color:#F3F3F7}.wlb[disabled]{opacity:.5}' +
    '.wlr{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #24242E}.wlq{display:flex;align-items:center;gap:8px}.wlq button{width:32px;height:32px;border-radius:50%;border:none;background:#24242E;color:#F3F3F7;font-size:17px;cursor:pointer}' +
    '.wlc{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.wlc button{height:44px;padding:0 15px;border-radius:12px;border:1px solid #2E2E3A;background:#0E0E14;color:#F3F3F7;font:600 14px Inter,sans-serif;cursor:pointer}.wlc button.on{background:#D4FF3A;color:#0E0E14;border-color:#D4FF3A}' +
    '.wle{color:#FF9A8B;font-size:14px;margin:6px 0}.wlm{color:#A7A7B8;font-size:13.5px;line-height:1.5;margin:4px 0 12px}.wlpix{word-break:break-all;font:12.5px monospace;background:#0E0E14;border-radius:12px;padding:12px;margin:10px 0;color:#C9C9D6}' +
    '.wlqr{display:block;width:200px;height:200px;margin:8px auto;background:#fff;border-radius:14px;padding:8px}' +
    '.wlcart{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom));z-index:60;height:54px;padding:0 22px;border-radius:999px;border:none;background:#D4FF3A;color:#0E0E14;font:700 15px Inter,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);cursor:pointer;white-space:nowrap}' +
    '.wlopt{display:block;width:100%;text-align:left;padding:14px;border-radius:14px;border:1px solid #2E2E3A;background:#0E0E14;color:#F3F3F7;font:15px Inter,sans-serif;margin:0 0 8px;cursor:pointer}';
  document.head.appendChild(css);

  function sheet(html) {
    close();
    var w = document.createElement('div');
    w.className = 'wls'; w.id = 'wls';
    w.innerHTML = '<div class="wlsb" role="dialog" aria-modal="true"><button class="x" aria-label="Fechar">×</button>' + html + '</div>';
    w.addEventListener('click', function (e) { if (e.target === w || e.target.classList.contains('x')) close(); });
    document.body.appendChild(w);
    return w.querySelector('.wlsb');
  }
  function close() { var o = document.getElementById('wls'); if (o) o.remove(); }
  function copyBtn(box, text) {
    var b = box.querySelector('[data-copy]');
    if (b) b.onclick = function () { try { navigator.clipboard.writeText(text); } catch (e) {} b.textContent = 'Copiado ✓'; };
  }
  function pixHtml(pix) {
    return pix ? '<div class="wlm">Pague com Pix copia e cola ou pelo QR code:</div><img class="wlqr" alt="QR code Pix" src="https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=0&data=' + encodeURIComponent(pix) + '"><div class="wlpix">' + esc(pix) + '</div><button class="wlb" data-copy>Copiar Pix copia e cola</button>' : '';
  }

  // ---------- loja ----------
  function cartCount() { var n = 0; for (var k in cart) n += cart[k]; return n; }
  function cartTotal() { var t = 0; (D.products || []).forEach(function (p) { if (cart[p.id]) t += p.cents * cart[p.id]; }); return t; }
  function save() { try { sessionStorage.setItem('wl_cart_' + D.h, JSON.stringify(cart)); } catch (e) {} paintCart(); }
  function paintCart() {
    var b = document.getElementById('wlcart');
    var n = cartCount();
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('button'); b.id = 'wlcart'; b.className = 'wlcart'; b.onclick = openCart; document.body.appendChild(b); }
    b.textContent = '🛍 Ver carrinho (' + n + ') · ' + brl(cartTotal());
    document.querySelectorAll('[data-add]').forEach(function (x) { var q = cart[x.dataset.add]; if (!x.disabled) { x.textContent = q ? 'No carrinho (' + q + ')' : 'Adicionar'; x.classList.toggle('in', !!q); } });
  }
  document.querySelectorAll('[data-add]').forEach(function (x) {
    x.onclick = function () { cart[x.dataset.add] = (cart[x.dataset.add] || 0) + 1; save(); };
  });
  function openCart() {
    var items = (D.products || []).filter(function (p) { return cart[p.id]; });
    var box = sheet('<h3>Seu carrinho</h3><div id="wlitems"></div>' +
      '<div class="wlr"><b>Total</b><b id="wltot"></b></div>' + (D.ship ? '<div class="wlm">+ frete de ' + brl(D.ship) + '</div>' : '') +
      '<div style="height:12px"></div><input id="wln" placeholder="Seu nome" autocomplete="name"><input id="wlp" placeholder="Seu WhatsApp com DDD" inputmode="tel" autocomplete="tel">' +
      (D.coupons ? '<input id="wlcp" placeholder="Cupom de desconto (opcional)" autocapitalize="characters">' : '') +
      '<textarea id="wlo" placeholder="Observação (tamanho, cor, endereço…)"></textarea><div class="wle" id="wle"></div>' +
      '<button class="wlb" id="wlgo">' + (D.pix ? 'Fazer pedido e pagar com Pix' : 'Fazer pedido pelo WhatsApp') + '</button>');
    function draw() {
      box.querySelector('#wlitems').innerHTML = items.filter(function (p) { return cart[p.id]; }).map(function (p) {
        return '<div class="wlr"><span>' + esc(p.name) + '<br><small style="opacity:.7">' + p.price + '</small></span><span class="wlq"><button data-m="' + p.id + '">−</button><b>' + cart[p.id] + '</b><button data-p="' + p.id + '">+</button></span></div>';
      }).join('') || '<div class="wlm">Carrinho vazio.</div>';
      box.querySelector('#wltot').textContent = brl(cartTotal());
      box.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { var k = b.dataset.m; cart[k]--; if (cart[k] <= 0) delete cart[k]; save(); draw(); }; });
      box.querySelectorAll('[data-p]').forEach(function (b) { b.onclick = function () { cart[b.dataset.p]++; save(); draw(); }; });
    }
    draw();
    box.querySelector('#wlgo').onclick = function () {
      var btn = this; btn.disabled = true;
      api('order', { items: Object.keys(cart).map(function (k) { return { id: k, qty: cart[k] }; }), name: box.querySelector('#wln').value, phone: box.querySelector('#wlp').value, note: box.querySelector('#wlo').value, coupon: D.coupons ? box.querySelector('#wlcp').value : '' })
        .then(function (r) {
          btn.disabled = false;
          if (!r.ok) { box.querySelector('#wle').textContent = r.error; return; }
          cart = {}; save();
          var b2 = sheet('<h3>Pedido ' + esc(r.code) + ' feito! 🎉</h3><div class="wlm">Total: <b style="color:#F3F3F7">' + esc(r.total) + '</b></div>' + pixHtml(r.pix) +
            (r.wa ? '<a class="wlb ' + (r.pix ? 'g' : '') + '" style="margin-top:10px" href="' + esc(r.wa) + '" target="_blank" rel="noopener">' + (r.pix ? 'Avisar que paguei no WhatsApp' : 'Enviar pedido no WhatsApp') + '</a>' : ''));
          copyBtn(b2, r.pix);
        });
    };
  }
  paintCart();

  // ---------- agenda ----------
  function openBooking() {
    var S = D.services || [], sel = { s: S.length === 1 ? S[0].id : '', d: '', ts: 0 };
    var box = sheet('<h3>Agendar horário</h3><div id="wlbk"></div>');
    function days() {
      var out = [], now = new Date();
      for (var i = 0; i < 21 && out.length < 14; i++) {
        var d = new Date(now.getTime() + i * 86400000 - 3 * 3600000);
        var iso = d.toISOString().slice(0, 10), dow = new Date(iso + 'T12:00:00Z').getUTCDay();
        if (D.days && !D.days[dow]) continue;
        out.push({ iso: iso, label: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dow] + ' ' + iso.slice(8, 10) + '/' + iso.slice(5, 7) });
      }
      return out;
    }
    function draw(slots) {
      var h = '';
      if (S.length > 1) h += '<div class="wlm">Serviço</div><div class="wlc">' + S.map(function (s) { return '<button data-s="' + s.id + '" class="' + (sel.s === s.id ? 'on' : '') + '">' + esc(s.name) + (s.price ? ' · ' + s.price : '') + '</button>'; }).join('') + '</div>';
      else if (S[0]) h += '<div class="wlm">' + esc(S[0].name) + (S[0].price ? ' · ' + S[0].price : '') + ' · ' + S[0].minutes + ' min</div>';
      if (sel.s) h += '<div class="wlm">Dia</div><div class="wlc">' + days().map(function (d) { return '<button data-d="' + d.iso + '" class="' + (sel.d === d.iso ? 'on' : '') + '">' + d.label + '</button>'; }).join('') + '</div>';
      if (sel.d) h += '<div class="wlm">Horário</div>' + (slots === null ? '<div class="wlm">Carregando…</div>' : slots.length ? '<div class="wlc">' + slots.map(function (x) { return '<button data-t="' + x.ts + '" class="' + (sel.ts === x.ts ? 'on' : '') + '">' + x.label + '</button>'; }).join('') + '</div>' : '<div class="wlm">Sem horários livres nesse dia. Escolha outro.</div>');
      if (sel.ts) {
        var svc = S.filter(function (s) { return s.id === sel.s; })[0];
        h += '<input id="wln" placeholder="Seu nome" autocomplete="name"><input id="wlp" placeholder="Seu WhatsApp com DDD" inputmode="tel" autocomplete="tel"><div class="wle" id="wle"></div><button class="wlb" id="wlgo">Confirmar agendamento' + (svc && svc.deposit ? ' (sinal ' + svc.deposit + ')' : '') + '</button>';
      }
      box.querySelector('#wlbk').innerHTML = h;
      box.querySelectorAll('[data-s]').forEach(function (b) { b.onclick = function () { sel = { s: b.dataset.s, d: '', ts: 0 }; draw(); }; });
      box.querySelectorAll('[data-d]').forEach(function (b) { b.onclick = function () { sel.d = b.dataset.d; sel.ts = 0; draw(null); fetch('/api/pub/slots?h=' + encodeURIComponent(D.h) + '&s=' + sel.s + '&d=' + sel.d).then(function (r) { return r.json(); }).then(function (r) { draw(r.slots || []); }); }; });
      box.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { sel.ts = +b.dataset.t; draw(slots); }; });
      var go = box.querySelector('#wlgo');
      if (go) go.onclick = function () {
        go.disabled = true;
        api('book', { service: sel.s, ts: sel.ts, name: box.querySelector('#wln').value, phone: box.querySelector('#wlp').value }).then(function (r) {
          go.disabled = false;
          if (!r.ok) { box.querySelector('#wle').textContent = r.error; return; }
          var b2 = sheet('<h3>Agendado! ✅</h3><div class="wlm">' + esc(r.service) + ' · <b style="color:#F3F3F7">' + esc(r.label) + '</b><br>Código ' + esc(r.code) + '</div>' + (r.pix ? '<div class="wlm">Para garantir o horário, pague o sinal de <b style="color:#F3F3F7">' + esc(r.deposit) + '</b>.</div>' + pixHtml(r.pix) : '') +
            (r.wa ? '<a class="wlb ' + (r.pix ? 'g' : '') + '" style="margin-top:10px" href="' + esc(r.wa) + '" target="_blank" rel="noopener">Confirmar no WhatsApp</a>' : ''));
          copyBtn(b2, r.pix);
        });
      };
    }
    draw();
  }

  // ---------- apoio ----------
  function openSupport() {
    var v = 0;
    var box = sheet('<h3>Apoiar 💛</h3><div class="wlm">Escolha um valor:</div><div class="wlc">' + [5, 10, 20, 50, 100].map(function (x) { return '<button data-v="' + x + '">R$ ' + x + '</button>'; }).join('') + '</div>' +
      '<input id="wlv" placeholder="Outro valor (ex.: 15,00)" inputmode="decimal"><input id="wln" placeholder="Seu nome (aparece no ranking)">' +
      (D.lvl >= 2 ? '<textarea id="wlmsg" maxlength="140" placeholder="Deixe uma mensagem (opcional)"></textarea>' : '') + '<div class="wle" id="wle"></div><button class="wlb" id="wlgo">Gerar Pix</button>');
    box.querySelectorAll('[data-v]').forEach(function (b) { b.onclick = function () { box.querySelectorAll('[data-v]').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); v = b.dataset.v; box.querySelector('#wlv').value = ''; }; });
    box.querySelector('#wlgo').onclick = function () {
      var val = box.querySelector('#wlv').value || v;
      api('support', { value: val, name: box.querySelector('#wln').value, message: D.lvl >= 2 ? box.querySelector('#wlmsg').value : '' }).then(function (r) {
        if (!r.ok) { box.querySelector('#wle').textContent = r.error; return; }
        var b2 = sheet('<h3>Obrigado! 💛</h3><div class="wlm">Seu apoio de <b style="color:#F3F3F7">' + esc(r.value) + '</b> entra na meta assim que o Pix for confirmado.</div>' + pixHtml(r.pix));
        copyBtn(b2, r.pix);
      });
    };
  }

  // ---------- quiz ----------
  function openQuiz(id) {
    var q = (D.quizzes || []).filter(function (x) { return x.id === id; })[0];
    if (!q) return;
    var ans = [], i = -1;
    var box = sheet('<div id="wlqz"></div>');
    function step() {
      var h;
      if (i < 0) h = '<h3>' + esc(q.title) + '</h3>' + (q.intro ? '<div class="wlm">' + esc(q.intro) + '</div>' : '') + '<button class="wlb" data-start>Começar</button>';
      else if (i < q.questions.length) {
        var Q = q.questions[i];
        h = '<div class="wlm">Pergunta ' + (i + 1) + ' de ' + q.questions.length + '</div><h3>' + esc(Q.q) + '</h3>' + Q.options.map(function (o, k) { return '<button class="wlopt" data-a="' + k + '">' + esc(o.t) + '</button>'; }).join('');
      } else h = '<h3>Quase lá! ✨</h3><div class="wlm">' + (q.askContact ? 'Deixe seu WhatsApp para ver o resultado.' : 'Veja seu resultado.') + '</div>' + (q.askContact ? '<input id="wln" placeholder="Seu nome"><input id="wlp" placeholder="Seu WhatsApp com DDD" inputmode="tel">' : '') + '<div class="wle" id="wle"></div><button class="wlb" id="wlgo">Ver meu resultado</button>';
      box.querySelector('#wlqz').innerHTML = h;
      var s = box.querySelector('[data-start]'); if (s) s.onclick = function () { i = 0; step(); };
      box.querySelectorAll('[data-a]').forEach(function (b) { b.onclick = function () { ans[i] = +b.dataset.a; i++; step(); }; });
      var go = box.querySelector('#wlgo');
      if (go) go.onclick = function () {
        api('quiz', { quiz: q.id, answers: ans, name: q.askContact ? box.querySelector('#wln').value : '', phone: q.askContact ? box.querySelector('#wlp').value : '' }).then(function (r) {
          if (!r.ok) { box.querySelector('#wle').textContent = r.error; return; }
          var R = r.result;
          box.querySelector('#wlqz').innerHTML = '<div class="wlm">Seu resultado</div><h3>' + esc(R.title) + '</h3><div class="wlm" style="color:#C9C9D6">' + esc(R.text) + '</div>' + (R.url ? '<a class="wlb" href="' + esc(R.url) + '" target="_blank" rel="noopener">' + esc(R.btn || 'Ver agora') + '</a>' : '');
        });
      };
    }
    step();
  }

  document.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { if (b.dataset.open === 'booking') openBooking(); if (b.dataset.open === 'support') openSupport(); }; });
  document.querySelectorAll('[data-quiz]').forEach(function (b) { b.onclick = function () { openQuiz(b.dataset.quiz); }; });
})();
