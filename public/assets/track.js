// Pixel da Meta do site WhiteLink (anúncios do próprio WhiteLink, não das páginas dos clientes).
// Para trocar o pixel, mude só o número abaixo. Vazio = desligado.
(function () {
  var ID = '4293861087575730';
  window.WL_track = function () {};
  if (!ID || window.fbq) return;
  !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0;
    t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', ID);
  fbq('track', 'PageView');
  // eventID igual ao do servidor: a Meta junta os dois e conta uma vez só
  window.WL_track = function (name, data, eventId) {
    try { fbq('track', name, data || {}, eventId ? { eventID: eventId } : undefined); } catch (e) {}
  };
})();
