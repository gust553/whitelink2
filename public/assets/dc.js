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

  function mount(rootEl, tplText, Component, props) {
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
    async api(path, method, body) {
      try {
        const r = await fetch('/api/' + path, { method: method || 'GET', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
        const d = await r.json().catch(() => ({ ok: false, error: 'Resposta inválida do servidor.' }));
        d.status = r.status; if (!r.ok && d.ok !== false) d.ok = false; return d;
      } catch (e) { return { ok: false, error: 'Sem conexão. Confira sua internet.' }; }
    }
  };
})();
