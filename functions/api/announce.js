import { json, fail, currentUser } from '../../src/lib.js';
import { getSettings } from '../../src/billing.js';

// Anúncio que aparece quando o cliente entra no painel
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  const s = await getSettings(env);
  return json({ ok: true, on: s.ann_on !== '0', title: s.ann_title || '', text: s.ann_text || '' });
}
