// Ajudantes do navegador
window.WL = {
  async api(path, method, body) {
    try {
      const r = await fetch('/api/' + path, {
        method: method || 'GET',
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin'
      });
      const d = await r.json().catch(() => ({ ok: false, error: 'Resposta inválida do servidor.' }));
      if (!r.ok && d.ok !== false) d.ok = false;
      d.status = r.status;
      return d;
    } catch (e) {
      return { ok: false, error: 'Sem conexão. Confira sua internet e tente de novo.' };
    }
  },
  $(id) { return document.getElementById(id); },
  phoneMask(el) {
    el.addEventListener('input', () => {
      const d = el.value.replace(/\D/g, '').slice(0, 11);
      let v = d;
      if (d.length > 2) v = '(' + d.slice(0, 2) + ') ' + d.slice(2);
      if (d.length > 7) v = '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
      el.value = v;
    });
  },
  busy(btn, on, text) {
    if (on) { btn.dataset.t = btn.textContent; btn.textContent = text || 'Aguarde…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.t || btn.textContent; btn.disabled = false; }
  }
};
