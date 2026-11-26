// Motor das telas do WhiteLink: roda as telas desenhadas no protótipo, no navegador.
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(patch) {
      const p = typeof patch === 'function' ? patch(this.state) : patch;
      this.state = Object.assign({}, this.state, p);
      if (this.__app) this.__app.schedule();
    }
  }
  window.DCLogic = DCLogic;

  const LINKS = window.DC_LINKS || {};
  const BOOL = /\s(checked|disabled|selected|readonly|hidden)="\{\{([^}]*)\}\}"/g;
  const EVT = /\s(on[A-Z]\w*)="\{\{\s*([^}]*?)\s*\}\}"/g;
  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fnCache = {};
  function ev(expr, scope) {
    let f = fnCache[expr];
    if (!f) { try { f = fnCache[expr] = new Function('__s', 'with(__s){return (' + expr + ')}'); } catch (e) { return undefined; } }
    try { return f(scope); } catch (e) { return undefined; }
  }

  function parse(s) {
    const re = /<(\/?)(sc-for|sc-if)\b([^>]*)>/g;
    const root = { kids: [] }; const stack = [root]; let last = 0, m;
    while ((m = re.exec(s))) {
      const top = stack[stack.length - 1];
      top.kids.push(s.slice(last, m.index)); last = re.lastIndex;
      if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
      const attrs = {}; m[3].replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => (attrs[k] = v));
      const node = { tag: m[2], attrs, kids: [] }; top.kids.push(node); stack.push(node);
    }
    root.kids.push(s.slice(last)); return root;
  }

  // nas páginas abertas (site, ajuda, termos), quem já entrou vê "Meu painel" em vez de "Entrar"
  function loggedLinks(root) {
    root.querySelectorAll('a[href="/entrar"], a[href="/entrar#cadastro"]').forEach((a) => {
      a.setAttribute('href', '/painel');
      if (/^\s*(Entrar|Testar grátis|Começar grátis)\s*$/.test(a.textContent)) a.textContent = 'Meu painel';
    });
  }
  function mount(rootEl, tplText, Component, props) {
    if (/^\/(ajuda|termos|privacidade)?$/.test(location.pathname)) {
      fetch('/api/me', { credentials: 'same-origin' }).then((r) => { if (r.ok) { window.__wlMe = true; loggedLinks(rootEl); } }).catch(() => {});
    }
    const tree = parse(tplText);
    const inst = new Component(props || {});
    let handlers = [], queued = false;
    const app = {
      schedule() { if (queued) return; queued = true; Promise.resolve().then(() => { queued = false; draw(); }); }
    };
    inst.__app = app;

    function fill(text, scope) {
      text = text.replace(EVT, (_, name, expr) => {
        const fn = ev(expr, scope);
        if (typeof fn !== 'function') return '';
        handlers.push(fn);
        return ' data-on-' + name.slice(2).toLowerCase() + '="' + (handlers.length - 1) + '"';
      });
      text = text.replace(BOOL, (_, a, e) => (ev(e.trim(), scope) ? ' ' + a : ''));
      text = text.replace(HOLE, (_, e) => { const v = ev(e, scope); if (v && typeof v === 'object' && v.__html !== undefined) return v.__html; return v == null || typeof v === 'function' ? '' : esc(v); });
      text = text.replace(/href="([A-Za-z]+\.dc\.html)([^"]*)"/g, (_, f, rest) => 'href="' + (LINKS[f] || '#') + rest + '"');
      return text;
    }
    function render(node, scope) {
      let out = '';
      for (const k of node.kids) {
        if (typeof k === 'string') { out += fill(k, scope); continue; }
        const expr = (k.attrs.list || k.attrs.value || '').replace(/^\{\{\s*|\s*\}\}$/g, '');
        const v = ev(expr, scope);
        if (k.tag === 'sc-if') { if (v) out += render(k, scope); continue; }
        if (!Array.isArray(v)) continue;
        for (const it of v) out += render(k, Object.assign(Object.create(scope), { [k.attrs.as]: it }));
      }
      return out;
    }
    // atualiza só o que mudou na tela (mantém rolagem, foco e animações)
    function morph(from, to) {
      if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName) { from.replaceWith(to); return; }
      if (from.nodeType === 3 || from.nodeType === 8) { if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue; return; }
      if (from.nodeType !== 1) return;
      for (const a of [...from.attributes]) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
      for (const a of [...to.attributes]) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
      if (from.tagName === 'INPUT' || from.tagName === 'TEXTAREA') {
        const v = to.getAttribute('value') ?? (from.tagName === 'TEXTAREA' ? to.textContent : '');
        if (document.activeElement !== from && from.value !== v && from.type !== 'file') from.value = v;
        if (from.type === 'checkbox' || from.type === 'radio') from.checked = to.hasAttribute('checked');
        if (from.tagName === 'TEXTAREA') return;
      }
      morphKids(from, to);
      if (from.tagName === 'SELECT') { const o = from.querySelector('option[selected]'); if (o && document.activeElement !== from) from.value = o.value; }
    }
    function morphKids(from, to) {
      const a = [...from.childNodes], b = [...to.childNodes];
      for (let i = 0; i < b.length; i++) { if (i < a.length) morph(a[i], b[i]); else from.appendChild(b[i]); }
      for (let i = b.length; i < a.length; i++) a[i].remove();
    }
    const EVENTS = ['click', 'input', 'change', 'keydown', 'keyup', 'submit', 'dragstart', 'dragover', 'drop', 'dragend', 'mouseenter', 'mouseleave', 'focus', 'blur'];
    for (const type of EVENTS) {
      rootEl.addEventListener(type, (e) => {
        const attr = 'data-on-' + type;
        let el = e.target;
        if (type === 'mouseenter' || type === 'mouseleave' || type === 'focus' || type === 'blur') { if (!(el && el.getAttribute && el.hasAttribute(attr))) return; }
        else { while (el && el !== rootEl && !(el.hasAttribute && el.hasAttribute(attr))) el = el.parentNode; if (!el || el === rootEl) return; }
        const fn = handlers[+el.getAttribute(attr)];
        if (typeof fn !== 'function') return;
        const ev2 = new Proxy(e, { get: (t, k) => (k === 'currentTarget' ? el : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) });
        fn(ev2);
      }, true);
    }
    let first = true;
    function draw() {
      handlers = [];
      let vals;
      try { vals = inst.renderVals(); } catch (e) { console.error(e); return; }
      const html = render(tree, vals);
      if (first) { rootEl.innerHTML = html; first = false; }
      else { const t = document.createElement('div'); t.innerHTML = html; morphKids(rootEl, t); }
      if (window.__wlMe) loggedLinks(rootEl);
    }
    draw();
    if (typeof inst.componentDidMount === 'function') inst.componentDidMount();
    window.addEventListener('beforeunload', () => { if (typeof inst.componentWillUnmount === 'function') inst.componentWillUnmount(); });
    return inst;
  }

  window.DC = {
    mount,
    html: (s) => ({ __html: String(s) }), // HTML fixo do próprio código (ícones), nunca dados do usuário
    // chamadas para o servidor do WhiteLink
    // Assistente de IA: devolve { ok, items } ou { ok:false, error }
    ai(task, input) { return this.api('ai', 'POST', { task: task, input: input || '' }); },
    // Escolhe uma foto no aparelho, reduz e envia. opts: { max: 1200, square: false }
    pickImage(opts) {
      opts = opts || {};
      return new Promise((resolve) => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = () => {
          const f = inp.files && inp.files[0];
          if (!f) return resolve(null);
          const img = new Image();
          img.onload = async () => {
            const max = opts.max || 1200;
            let sx = 0, sy = 0, sw = img.width, sh = img.height;
            if (opts.square) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m; }
            const k = Math.min(1, max / Math.max(sw, sh));
            const c = document.createElement('canvas'); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
            c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
            let q = 0.85, data = c.toDataURL('image/jpeg', q);
            while (data.length > 1000000 && q > 0.4) { q -= 0.15; data = c.toDataURL('image/jpeg', q); }
            URL.revokeObjectURL(img.src);
            resolve(await this.api('media', 'POST', { data: data }));
          };
          img.onerror = () => resolve({ ok: false, error: 'Não consegui abrir essa foto.' });
          img.src = URL.createObjectURL(f);
        };
        inp.click();
      });
    },
    // página que está sendo editada (Diamante pode ter até 3). 0 = principal.
    page() { try { return parseInt(localStorage.getItem('wl_page'), 10) || 0; } catch (e) { return 0; } },
    setPage(id, handle) { try { if (id) { localStorage.setItem('wl_page', String(id)); localStorage.setItem('wl_page_h', handle || ''); } else { localStorage.removeItem('wl_page'); localStorage.removeItem('wl_page_h'); } } catch (e) {} },
    async api(path, method, body) {
      const pid = this.page();
      if (pid && /^(editor|appearance)(\?|$)/.test(path)) path += (path.indexOf('?') < 0 ? '?' : '&') + 'p=' + pid;
      try {
        const r = await fetch('/api/' + path, { method: method || 'GET', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
        const d = await r.json().catch(() => ({ ok: false, error: 'Resposta inválida do servidor.' }));
        d.status = r.status; if (!r.ok && d.ok !== false) d.ok = false;
        if (pid && r.status === 404 && /^(editor|appearance)/.test(path)) { this.setPage(0); location.reload(); }
        return d;
      } catch (e) { return { ok: false, error: 'Sem conexão. Confira sua internet.' }; }
    }
  };
  // aviso de qual página está sendo editada (Diamante com mais de uma página)
  document.addEventListener('DOMContentLoaded', function () {
    var h = ''; try { h = window.DC.page() ? localStorage.getItem('wl_page_h') || '' : ''; } catch (e) {}
    if (!h || !/^\/painel\/(aparencia|temas|criador-tema|agendamentos)/.test(location.pathname)) return;
    var a = document.createElement('a');
    a.href = '/painel'; a.textContent = 'Editando whitelink.site/' + h + ' · trocar';
    a.setAttribute('style', 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom));z-index:30;padding:8px 14px;border-radius:999px;background:#F3F3F7;color:#0E0E14;font:600 13px Inter,sans-serif;text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,.4);white-space:nowrap');
    document.body.appendChild(a);
  });
})();
