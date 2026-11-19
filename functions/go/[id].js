// Conta o clique e manda o visitante para o link
export async function onRequestGet({ env, params }) {
  const id = Number(params.id) || 0;
  const l = await env.DB.prepare('SELECT url, active FROM links WHERE id = ?').bind(id).first();
  if (!l || !l.active) return Response.redirect('https://whitelink.site/', 302);
  await env.DB.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?').bind(id).run();
  return Response.redirect(l.url, 302);
}
