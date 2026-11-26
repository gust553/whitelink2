import { json } from '../../src/lib.js';
import { getSettings, priceOf, brl } from '../../src/billing.js';

// Preços públicos (para o site de vendas)
export async function onRequestGet({ env }) {
  const s = await getSettings(env);
  const out = {};
  for (const p of ['ouro', 'diamante', 'agencia']) for (const per of ['m', 'y']) out[p + '_' + per] = brl(priceOf(s, p, per));
  return json({ ok: true, prices: out }, 200);
}
