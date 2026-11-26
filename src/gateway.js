// Gateways de pagamento (Pix automático). O admin escolhe qual usar e pode trocar quando quiser.
// O plano só libera depois de consultarmos o pagamento direto no gateway (nunca confiamos só no aviso).
import { releaseOrder } from './billing.js';

const J = (r) => r.json().catch(() => ({}));
const isoDay = (t) => new Date(t - 3 * 3600000).toISOString().slice(0, 10); // dia em Brasília
const digits = (v) => String(v || '').replace(/\D/g, '');

// ---------- cada gateway ----------
export const PROVIDERS = {
  mercadopago: {
    name: 'Mercado Pago', doc: false,
    async check(tok) {
      const r = await fetch('https://api.mercadopago.com/users/me', { headers: { authorization: 'Bearer ' + tok } });
      const d = await J(r);
      return { st: r.status, ok: r.ok, account: [d.nickname, d.email].filter(Boolean).join(' · ') };
    },
    async create(tok, o, u) {
      const r = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json', 'x-idempotency-key': o.code },
        body: JSON.stringify({
          transaction_amount: o.cents / 100, description: desc(o), payment_method_id: 'pix', external_reference: o.code,
          notification_url: 'https://whitelink.site/api/webhooks/gateway?p=mercadopago',
          date_of_expiration: new Date(o.expires_at).toISOString().replace(/\.\d+Z$/, '.000-00:00'),
          payer: { email: u.email, first_name: String(u.name).split(' ')[0] }
        })
      });
      const d = await J(r);
      const t = d.point_of_interaction && d.point_of_interaction.transaction_data;
      if (!r.ok || !t || !t.qr_code) return { ok: false, error: d.message || 'O Mercado Pago não respondeu.' };
      return { ok: true, id: String(d.id), pix: t.qr_code };
    },
    async status(tok, id) {
      const r = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(id), { headers: { authorization: 'Bearer ' + tok } });
      if (!r.ok) return null;
      const d = await J(r);
      return { paid: d.status === 'approved', dead: ['cancelled', 'rejected', 'expired'].includes(d.status), ref: d.external_reference, cents: Math.round(Number(d.transaction_amount) * 100), payer: (d.payer && (d.payer.first_name || d.payer.email)) || '' };
    }
  },
  asaas: {
    name: 'Asaas', doc: true,
    base: (tok) => (/_hmlg_/.test(tok) ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3'),
    h: (tok) => ({ access_token: tok, 'content-type': 'application/json', 'user-agent': 'WhiteLink/1.0' }),
    async check(tok) {
      const r = await fetch(this.base(tok) + '/myAccount/commercialInfo', { headers: this.h(tok) });
      const d = await J(r);
      return { st: r.status, ok: r.ok, account: [d.name || d.companyName, d.email].filter(Boolean).join(' · ') || 'Conta Asaas' };
    },
    async create(tok, o, u, doc) {
      const B = this.base(tok), H = this.h(tok);
      const c = await fetch(B + '/customers', { method: 'POST', headers: H, body: JSON.stringify({ name: u.name, cpfCnpj: doc, email: u.email, mobilePhone: digits(u.phone).slice(-11), externalReference: 'wl' + u.id, notificationDisabled: true }) });
      const cd = await J(c);
      if (!c.ok || !cd.id) return { ok: false, error: err(cd) || 'O Asaas recusou o cadastro do pagador.' };
      const p = await fetch(B + '/payments', { method: 'POST', headers: H, body: JSON.stringify({ customer: cd.id, billingType: 'PIX', value: o.cents / 100, dueDate: isoDay(o.expires_at), description: desc(o), externalReference: o.code }) });
      const pd = await J(p);
      if (!p.ok || !pd.id) return { ok: false, error: err(pd) || 'O Asaas não criou a cobrança.' };
      const q = await fetch(B + '/payments/' + pd.id + '/pixQrCode', { headers: H });
      const qd = await J(q);
      if (!q.ok || !qd.payload) return { ok: false, error: err(qd) || 'O Asaas não gerou o Pix. Confira se a conta tem chave Pix cadastrada.' };
      return { ok: true, id: pd.id, pix: qd.payload };
    },
    async status(tok, id) {
      const r = await fetch(this.base(tok) + '/payments/' + encodeURIComponent(id), { headers: this.h(tok) });
      if (!r.ok) return null;
      const d = await J(r);
      return { paid: ['RECEIVED', 'CONFIRMED'].includes(d.status), dead: d.status === 'REFUNDED' || !!d.deleted, ref: d.externalReference, cents: Math.round(Number(d.value) * 100), payer: '' };
    }
  },
  pagbank: {
    name: 'PagBank', doc: true, sandbox: true,
    base: (s) => (s ? 'https://sandbox.api.pagseguro.com' : 'https://api.pagseguro.com'),
    h: (tok) => ({ authorization: 'Bearer ' + tok, 'content-type': 'application/json', accept: 'application/json' }),
    async check(tok, sb) {
      // token válido: o pedido de teste não existe (404/400). Token errado: 401/403.
      const r = await fetch(this.base(sb) + '/orders/ORDE_00000000-0000-0000-0000-000000000000', { headers: this.h(tok) });
      return { st: r.status === 401 || r.status === 403 ? r.status : 200, ok: r.status !== 401 && r.status !== 403 && r.status < 500, account: 'Conta PagBank' + (sb ? ' (testes)' : '') };
    },
    async create(tok, o, u, doc, sb) {
      const ph = digits(u.phone).slice(-11);
      const r = await fetch(this.base(sb) + '/orders', {
        method: 'POST', headers: Object.assign({ 'x-idempotency-key': o.code }, this.h(tok)),
        body: JSON.stringify({
          reference_id: o.code,
          customer: { name: u.name, email: u.email, tax_id: doc, phones: ph.length >= 10 ? [{ country: '55', area: ph.slice(0, 2), number: ph.slice(2), type: 'MOBILE' }] : undefined },
          items: [{ reference_id: o.plan, name: desc(o), quantity: 1, unit_amount: o.cents }],
          qr_codes: [{ amount: { value: o.cents }, expiration_date: new Date(o.expires_at).toISOString().replace(/\.\d+Z$/, '-00:00') }],
          notification_urls: ['https://whitelink.site/api/webhooks/gateway?p=pagbank']
        })
      });
      const d = await J(r);
      const q = d.qr_codes && d.qr_codes[0];
      if (!r.ok || !q || !q.text) return { ok: false, error: err(d) || 'O PagBank não gerou o Pix.' };
      return { ok: true, id: d.id, pix: q.text };
    },
    async status(tok, id, sb) {
      const r = await fetch(this.base(sb) + '/orders/' + encodeURIComponent(id), { headers: this.h(tok) });
      if (!r.ok) return null;
      const d = await J(r);
      const ch = (d.charges || []).find((c) => c.status === 'PAID');
      return { paid: !!ch, dead: false, ref: d.reference_id, cents: ch ? Number(ch.amount && ch.amount.value) : 0, payer: '' };
    }
  },
  pagarme: {
    name: 'Pagar.me', doc: true,
    h: (tok) => ({ authorization: 'Basic ' + btoa(tok + ':'), 'content-type': 'application/json' }),
    async check(tok) {
      const r = await fetch('https://api.pagar.me/core/v5/orders?size=1', { headers: this.h(tok) });
      return { st: r.status, ok: r.ok, account: 'Conta Pagar.me' + (/^sk_test_/.test(tok) ? ' (testes)' : '') };
    },
    async create(tok, o, u, doc) {
      const ph = digits(u.phone).slice(-11);
      const r = await fetch('https://api.pagar.me/core/v5/orders', {
        method: 'POST', headers: this.h(tok),
        body: JSON.stringify({
          code: o.code, closed: true,
          items: [{ amount: o.cents, description: desc(o), quantity: 1, code: o.plan }],
          customer: { name: u.name, email: u.email, type: doc.length > 11 ? 'company' : 'individual', document: doc, phones: { mobile_phone: { country_code: '55', area_code: ph.slice(0, 2), number: ph.slice(2) } } },
          payments: [{ payment_method: 'pix', pix: { expires_in: Math.max(60, Math.round((o.expires_at - Date.now()) / 1000)) } }]
        })
      });
      const d = await J(r);
      const t = d.charges && d.charges[0] && d.charges[0].last_transaction;
      if (!r.ok || !t || !t.qr_code) return { ok: false, error: err(d) || 'O Pagar.me não gerou o Pix.' };
      return { ok: true, id: d.id, pix: t.qr_code };
    },
    async status(tok, id) {
      const r = await fetch('https://api.pagar.me/core/v5/orders/' + encodeURIComponent(id), { headers: this.h(tok) });
      if (!r.ok) return null;
      const d = await J(r);
      return { paid: d.status === 'paid', dead: ['canceled', 'failed'].includes(d.status), ref: d.code, cents: Number(d.amount), payer: '' };
    }
  }
};

function desc(o) { return 'WhiteLink ' + ({ ouro: 'Ouro', diamante: 'Diamante', agencia: 'Agência' }[o.plan] || '') + (o.period === 'y' ? ' anual' : ' mensal'); }
function err(d) {
  if (!d) return '';
  if (Array.isArray(d.errors) && d.errors[0]) return String(d.errors[0].description || d.errors[0].message || '').slice(0, 160);
  if (Array.isArray(d.error_messages) && d.error_messages[0]) return String(d.error_messages[0].description || '').slice(0, 160);
  return String(d.message || '').slice(0, 160);
}

// ---------- configuração salva ----------
export function gwProvider(s) { return PROVIDERS[s.gw_provider] ? s.gw_provider : 'mercadopago'; }
export function gwToken(s, p) { p = p || gwProvider(s); return s['gw_tok_' + p] || (p === 'mercadopago' ? s.gw_token || '' : ''); }
export function gwSandbox(s, p) { return (p || gwProvider(s)) === 'pagbank' && s.gw_sandbox === '1'; }
export function gatewayReady(s) { return s.pay_mode === 'gateway' && gwToken(s).length > 15; }
export function gatewayNeedsDoc(s) { return gatewayReady(s) && PROVIDERS[gwProvider(s)].doc; }

// Confere o token. Devolve { ok, account } ou { ok:false, error, offline }
export async function gatewayCheck(p, token, sandbox) {
  const P = PROVIDERS[p];
  if (!P) return { ok: false, error: 'Gateway desconhecido.' };
  try {
    const c = await P.check(token, sandbox);
    if (c.st === 401 || c.st === 403) return { ok: false, error: 'O ' + P.name + ' recusou esta chave. Confira se copiou a chave de produção inteira.' };
    if (!c.ok) return { ok: false, offline: true, error: 'O ' + P.name + ' não respondeu agora. Tente de novo em alguns minutos.' };
    return { ok: true, account: c.account || P.name };
  } catch (e) { return { ok: false, offline: true, error: 'Sem conexão com o ' + P.name + ' agora.' }; }
}

// CPF/CNPJ válido (dígitos verificadores)
export function validDoc(v) {
  const d = digits(v);
  const calc = (base, w) => { let s = 0; for (let i = 0; i < base.length; i++) s += +base[i] * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  if (d.length === 11 && !/^(\d)\1+$/.test(d)) {
    const a = calc(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]), b = calc(d.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return a === +d[9] && b === +d[10] ? d : '';
  }
  if (d.length === 14 && !/^(\d)\1+$/.test(d)) {
    const a = calc(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]), b = calc(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return a === +d[12] && b === +d[13] ? d : '';
  }
  return '';
}

// ---------- cobrar e conferir ----------
export async function gatewayCreate(env, s, o, u, doc) {
  const p = gwProvider(s);
  try {
    const g = await PROVIDERS[p].create(gwToken(s, p), o, u, doc, gwSandbox(s, p));
    if (!g.ok) return g;
    await env.DB.prepare('INSERT OR REPLACE INTO order_gw (order_id, gw_id, pix, created_at, provider) VALUES (?, ?, ?, ?, ?)').bind(o.id, String(g.id), g.pix, Date.now(), p).run();
    return { ok: true };
  } catch (e) { return { ok: false, error: 'Sem conexão com o ' + PROVIDERS[p].name + '.' }; }
}

// Consulta o pagamento no gateway que gerou o Pix e libera o plano se estiver pago (valor e pedido conferidos)
export async function gatewaySync(env, s, o) {
  try { return await sync(env, s, o); } catch (e) { return false; }
}
async function sync(env, s, o) {
  if (!o || o.method !== 'gateway' || o.status !== 'aguardando') return false;
  const g = await env.DB.prepare('SELECT * FROM order_gw WHERE order_id = ?').bind(o.id).first();
  if (!g) return false;
  const p = PROVIDERS[g.provider] ? g.provider : 'mercadopago';
  const tok = gwToken(s, p);
  if (!tok) return false;
  const st = await PROVIDERS[p].status(tok, g.gw_id, gwSandbox(s, p));
  if (!st) return false;
  if (st.paid && st.ref === o.code && st.cents === o.cents) {
    const fresh = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(o.id).first();
    if (fresh.status !== 'aguardando') return false;
    await env.DB.prepare('UPDATE orders SET e2e = ?, payer = ? WHERE id = ?').bind(p.slice(0, 2).toUpperCase() + '-' + g.gw_id, st.payer || '', o.id).run();
    await releaseOrder(env, fresh);
    return true;
  }
  if (st.dead) await env.DB.prepare("UPDATE orders SET status = 'vencido' WHERE id = ?").bind(o.id).run();
  return false;
}
