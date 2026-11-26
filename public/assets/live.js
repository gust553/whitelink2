// WhiteLink — prova social ao vivo (Diamante)
(function () {
  var L = window.WL_LIVE; if (!L) return;
  var sid; try { sid = sessionStorage.getItem('wl_sid'); if (!sid) { sid = Math.random().toString(36).slice(2, 14); sessionStorage.setItem('wl_sid', sid); } } catch (e) { sid = Math.random().toString(36).slice(2, 14); }
  var css = document.createElement('style');
  css.textContent = '.wlv{position:fixed;left:14px;top:14px;z-index:70;padding:8px 13px;border-radius:999px;background:rgba(14,14,20,.78);color:#fff;font:600 12.5px Inter,system-ui,sans-serif;backdrop-filter:blur(8px);display:flex;align-items:center;gap:7px;transition:opacity .3s}' +
    '.wlv i{width:8px;height:8px;border-radius:50%;background:#4ADE80;box-shadow:0 0 0 0 rgba(74,222,128,.7);animation:wlvP 1.8s infinite}@keyframes wlvP{70%{box-shadow:0 0 0 8px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}' +
    '.wlt{position:fixed;left:14px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:70;max-width:300px;padding:11px 14px;border-radius:16px;background:rgba(14,14,20,.88);color:#fff;font:13.5px/1.35 Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);backdrop-filter:blur(8px);transform:translateY(20px);opacity:0;transition:all .4s cubic-bezier(.2,.8,.2,1)}.wlt.on{transform:none;opacity:1}.wlt small{display:block;opacity:.65;font-size:11.5px;margin-top:2px}';
  document.head.appendChild(css);
  var pill = null, shown = {}, queue = [];
  function tick() {
    fetch('/api/pub/live?h=' + encodeURIComponent(L.h) + '&sid=' + sid).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) return;
      if (L.v && d.viewers >= 2) {
        if (!pill) { pill = document.createElement('div'); pill.className = 'wlv'; document.body.appendChild(pill); }
        pill.innerHTML = '<i></i>' + d.viewers + ' pessoas vendo agora';
      } else if (pill) { pill.remove(); pill = null; }
      if (L.s) (d.recent || []).forEach(function (x) { var k = x.t + x.ago; if (!shown[x.t]) { shown[x.t] = 1; queue.push(x); } });
    }).catch(function () {});
  }
  function toast() {
    var x = queue.shift(); if (!x) return;
    var t = document.createElement('div'); t.className = 'wlt';
    t.textContent = '🛍 ' + x.t;
    var s = document.createElement('small'); s.textContent = x.ago < 60 ? 'há ' + x.ago + ' min' : 'há ' + Math.round(x.ago / 60) + ' h'; t.appendChild(s);
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('on'); });
    setTimeout(function () { t.classList.remove('on'); setTimeout(function () { t.remove(); }, 500); }, 4500);
  }
  tick(); setInterval(function () { if (!document.hidden) tick(); }, 25000);
  setTimeout(function () { toast(); setInterval(toast, 9000); }, 3500);
})();
