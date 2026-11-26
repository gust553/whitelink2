import { json, fail, readJson, cleanEmail, cleanPhone, cleanHandle, cleanInstagram, cleanText, passwordOk,
  hashPassword, issueCode, codeReply, rateLimit, clientIp } from '../../../src/lib.js';

// Passo 1 do cadastro: confere os dados e manda o código por SMS
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  if (!b) return fail('Dados inválidos.');
  const name = cleanText(b.name, 60);
  const email = cleanEmail(b.email);
  const phone = cleanPhone(b.phone);
  const handle = cleanHandle(b.handle);
  const instagram = cleanInstagram(b.instagram);
  if (name.length < 2) return fail('Escreva seu nome.');
  if (!email) return fail('E-mail inválido.');
  if (!phone) return fail('Celular inválido. Use DDD + número, ex.: (11) 99999-9999.');
  if (!instagram) return fail('Escreva o @ do Instagram.');
  if (!handle) return fail('Endereço inválido. Use de 3 a 30 letras, números, ponto ou _.');
  if (!passwordOk(b.password)) return fail('A senha precisa ter pelo menos 8 caracteres, com letras e números.');
  if (!b.terms) return fail('Aceite os Termos de uso e a Política de privacidade.');

  const ip = clientIp(request);
  if (!(await rateLimit(env, 'signup-ip:' + ip, 8, 3600000))) return fail('Muitas tentativas. Tente de novo mais tarde.', 429);
  if (!(await rateLimit(env, 'signup-phone:' + phone, 4, 3600000))) return fail('Muitos códigos para este celular. Tente de novo em 1 hora.', 429);

  const dup = await env.DB.prepare('SELECT email, phone, handle FROM users WHERE email = ? OR phone = ? OR handle = ?')
    .bind(email, phone, handle).first();
  if (dup) {
    if (dup.email === email) return fail('Este e-mail já tem conta. Entre ou recupere a senha.');
    if (dup.phone === phone) return fail('Este celular já tem conta. Entre ou recupere a senha.');
    return fail('Esse endereço já está em uso. Escolha outro.');
  }
  if (await env.DB.prepare('SELECT 1 AS x FROM pages WHERE handle = ?').bind(handle).first()) return fail('Esse endereço já está em uso. Escolha outro.');

  const pw = await hashPassword(String(b.password));
  const issued = await issueCode(env, phone, 'signup', {
    name, email, phone, handle, instagram, hash: pw.hash, salt: pw.salt,
    ref: cleanText(b.ref, 30).toUpperCase()
  });
  return json(codeReply(issued, { phoneEnd: phone.slice(-4) }));
}
