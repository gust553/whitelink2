import { fail, currentUser, ensureSchema, effectivePlan } from '../../src/lib.js';
import { statsData } from './stats.js';

// Exportar estatísticas em planilha (Diamante)
export async function onRequestGet({ request, env }) {
  await ensureSchema(env);
  const u = await currentUser(env, request);
  if (!u) return fail('Entre na sua conta.', 401);
  if (effectivePlan(u).plan !== 'diamante') return fail('Exportar é do Diamante.', 403);
  const d = await statsData(env, u, 90);
  let csv = 'dia;visitas\n' + d.series.map((r) => r.day + ';' + r.views).join('\n');
  csv += '\n\nlink;cliques\n' + (d.links || []).map((l) => '"' + l.title.replace(/"/g, '""') + '";' + l.clicks).join('\n');
  return new Response('﻿' + csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="whitelink-estatisticas.csv"' } });
}
