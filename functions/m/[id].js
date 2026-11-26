// Entrega uma foto guardada: /m/abc123
export async function onRequestGet({ env, params }) {
  const id = String(params.id || '').replace(/[^a-f0-9]/g, '');
  const r = await env.DB.prepare('SELECT mime, data FROM media WHERE id = ?').bind(id).first();
  if (!r) return new Response('Não encontrado', { status: 404 });
  const bin = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
  return new Response(bin, { headers: { 'content-type': r.mime, 'cache-control': 'public, max-age=31536000, immutable' } });
}
