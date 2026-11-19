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
      text = text.replace(HOLE, (_, e) => { const v = ev(e, scope); return v == null || typeof v === 'function' ? '' : esc(v); });
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
    function draw() {
      // guarda o foco e o cursor para não atrapalhar quem está digitando
      const act = document.activeElement;
      let focusIdx = -1, selS = null, selE = null;
      if (act && rootEl.contains(act) && /^(INPUT|TEXTAREA|SELECT)$/.test(act.tagName)) {
        focusIdx = [...rootEl.querySelectorAll('input,textarea,select')].indexOf(act);
        try { selS = act.selectionStart; selE = act.selectionEnd; } catch (e) {}
      }
      handlers = [];
      let vals;
      try { vals = inst.renderVals(); } catch (e) { console.error(e); return; }
      rootEl.innerHTML = render(tree, vals);
      rootEl.querySelectorAll('*').forEach((el) => {
        for (const a of [...el.attributes]) {
          if (!a.name.startsWith('data-on-')) continue;
          const fn = handlers[+a.value];
          el.addEventListener(a.name.slice(8), (e) => fn(e));
        }
      });
      rootEl.querySelectorAll('select').forEach((s) => { const o = s.querySelector('option[selected]'); if (o) s.value = o.value; });
      if (focusIdx >= 0) {
        const el = rootEl.querySelectorAll('input,textarea,select')[focusIdx];
        if (el) { el.focus(); try { if (selS != null) el.setSelectionRange(selS, selE); } catch (e) {} }
      }
    }
    draw();
    if (typeof inst.componentDidMount === 'function') inst.componentDidMount();
    window.addEventListener('beforeunload', () => { if (typeof inst.componentWillUnmount === 'function') inst.componentWillUnmount(); });
    return inst;
  }

  window.DC = {
    mount,
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
