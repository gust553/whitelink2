// Tema criado pelo cliente (Diamante). Mesmo código no servidor e no navegador (o build gera /assets/customcss.js).
export const CUSTOM_FONTS = ['Space Grotesk', 'Inter', 'Playfair Display', 'DM Serif Display', 'Syne', 'Caveat', 'Bebas Neue', 'Outfit', 'Poppins', 'Montserrat', 'Lobster', 'Pacifico'];
export const CUSTOM_DEF = { bg1: '#1b1035', bg2: '#0b0b10', grad: 1, text: '#f3f3f7', btn: '#d4ff3a', btnText: '#0e0e14', style: 0, radius: 1, font: 0,
  bgImg: '', bgDim: 35, bgBlur: 0, pattern: 0, card: '#ffffff', cardOp: 10, head: 0, avShape: 0, layout: 0, align: 0, gap: 1, shadow: 0, infoPos: 0, handle: 1, icons: 0 };
export function cleanCustom(c) {
  c = c || {};
  const D = CUSTOM_DEF;
  const col = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : d);
  const n = (v, max, d) => { const x = parseInt(v, 10); return x >= 0 && x <= max ? x : d; };
  return {
    bg1: col(c.bg1, D.bg1), bg2: col(c.bg2, D.bg2), grad: n(c.grad, 3, 1), text: col(c.text, D.text), btn: col(c.btn, D.btn), btnText: col(c.btnText, D.btnText),
    style: n(c.style, 2, 0), radius: n(c.radius, 2, 1), font: n(c.font, CUSTOM_FONTS.length - 1, 0),
    bgImg: /^[a-f0-9]{24}$/.test(c.bgImg || '') ? c.bgImg : '', bgDim: n(c.bgDim, 85, 35), bgBlur: n(c.bgBlur, 1, 0), pattern: n(c.pattern, 3, 0),
    card: col(c.card, D.card), cardOp: n(c.cardOp, 100, 10), head: n(c.head, 2, 0), avShape: n(c.avShape, 2, 0), layout: n(c.layout, 1, 0),
    align: n(c.align, 1, 0), gap: n(c.gap, 2, 1), shadow: n(c.shadow, 1, 0), infoPos: n(c.infoPos, 1, 0), handle: n(c.handle, 1, 1), icons: n(c.icons, 1, 0)
  };
}
export function customCss(c) {
  c = cleanCustom(c);
  const S = '.t-custom';
  const rgba = (h, o) => 'rgba(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ',' + o + ')';
  const g = [c.bg1, 'linear-gradient(180deg,' + c.bg1 + ',' + c.bg2 + ')', 'linear-gradient(135deg,' + c.bg1 + ',' + c.bg2 + ')', 'radial-gradient(circle at 50% 0%,' + c.bg1 + ',' + c.bg2 + ' 70%)'][c.grad];
  const r = ['6px', '16px', '999px'][c.radius];
  const btn = [
    'background:' + c.btn + ';color:' + c.btnText + ';border:1px solid ' + c.btn,
    'background:transparent;color:' + c.text + ';border:2px solid ' + c.btn,
    'background:rgba(255,255,255,.12);color:' + c.text + ';border:1px solid rgba(255,255,255,.22);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)'
  ][c.style];
  const pat = ['', 'radial-gradient(' + rgba(c.text, 0.14) + ' 1.2px,transparent 1.6px) 0 0/18px 18px',
    'linear-gradient(' + rgba(c.text, 0.07) + ' 1px,transparent 1px) 0 0/26px 26px,linear-gradient(90deg,' + rgba(c.text, 0.07) + ' 1px,transparent 1px) 0 0/26px 26px',
    'repeating-linear-gradient(45deg,' + rgba(c.text, 0.06) + ' 0 2px,transparent 2px 14px)'][c.pattern];
  let css = S + '{color:' + c.text + ";font-family:'" + CUSTOM_FONTS[c.font] + "',sans-serif}" +
    S + ' .ph-bg{background:' + g + '}' + S + ' .ph-bg::before,' + S + ' .ph-bg::after{display:none}' +
    S + ' .ph-av{background:rgba(255,255,255,.12);border:2px solid ' + c.btn + ';color:' + c.text + ';border-radius:' + ['50%', '24%', '50%'][c.avShape] + '}' +
    S + ' .ph-btn{' + btn + ';border-radius:' + r + ';text-align:' + (c.align ? 'left' : 'center') + (c.shadow ? ';box-shadow:0 8px 22px rgba(0,0,0,.28)' : '') + '}' +
    S + ' .ph-btn.main{background:' + c.btn + ';color:' + c.btnText + ';border:1px solid ' + c.btn + '}' +
    S + ' .ph-card{background:' + rgba(c.card, c.cardOp / 100) + ';border-radius:' + r + ';color:' + c.text + (c.shadow ? ';box-shadow:0 8px 22px rgba(0,0,0,.22)' : '') + '}' +
    S + ' .ph-thumb{background:rgba(255,255,255,.16)}' + S + ' .ph-orn,' + S + ' .ph-tag{display:none}' +
    S + ' .ph-in{gap:' + ['7px', '11px', '17px'][c.gap] + '}';
  if (c.bgImg) css += S + ' .ph-bg{background:' + c.bg2 + ' url(/m/' + c.bgImg + ') center/cover no-repeat' + (c.bgBlur ? ';filter:blur(6px);transform:scale(1.06)' : '') + '}' +
    S + ' .ph-bg::after{display:block;content:"";position:absolute;inset:0;background:rgba(0,0,0,' + c.bgDim / 100 + ')}';
  if (pat) css += S + ' .ph-bg::before{display:block;content:"";position:absolute;inset:0;background:' + pat + '}';
  if (c.head === 1) css += S + ' .ph-head{align-items:flex-start;text-align:left}';
  if (c.head === 2) css += S + ' .ph-head{display:grid;grid-template-columns:auto 1fr;column-gap:14px;align-items:center;text-align:left}' + S + ' .ph-head .ph-av{grid-row:span 3;margin:0}' + S + ' .ph-head>*:not(.ph-av){grid-column:2}';
  if (c.avShape === 2) css += S + ' .ph-av{display:none!important}' + S + ' .ph-head{grid-template-columns:1fr!important}';
  if (!c.handle) css += S + ' .ph-handle{display:none!important}';
  if (c.infoPos) css += S + ' .ph-head{order:98}' + S + ' .ph-foot{order:99}';
  if (c.layout) css += S + ' .ph-in{display:grid;grid-template-columns:1fr 1fr;align-content:start}' + S + ' .ph-in>*:not(.ph-btn){grid-column:1/-1}' + S + ' .ph-btn,.ph' + S + ' .ph-in .ph-btn{display:flex;align-items:center;justify-content:' + (c.align ? 'flex-start' : 'center') + ';min-height:74px}';
  if (c.icons) css += S + ' .ph-btn:not(.main)::after{content:"›";position:absolute;right:16px;top:50%;transform:translateY(-50%);font-size:20px;opacity:.7}';
  return css;
}
