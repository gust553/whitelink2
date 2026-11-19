# WhiteLink

Página de links para a bio — whitelink.site

## Como está organizado

- `public/` — as telas do site (página de vendas, entrar, painel, ajuda, termos, privacidade, 404)
- `functions/` — o "cérebro" que roda na Cloudflare (cadastro, login, links, página pública)
- `src/lib.js` — funções comuns (senhas, sessões, SMS, antifraude)
- `schema.sql` — estrutura do banco de dados (Cloudflare D1)

## Parte 1 (pronta)

- Página de vendas com verificação de endereço livre
- Cadastro com código por SMS e teste Diamante de 3 dias (um por e-mail, celular, Instagram e aparelho)
- Login, sair e recuperar senha por SMS
- Painel: links (adicionar, editar, esconder, ordenar, apagar), nome, bio, tema Noite/Papel
- Limites por plano: Prata 3 links, Ouro 10, Diamante ilimitado
- Página pública whitelink.site/nome com contagem de visitas e cliques
- Proteções: senha criptografada, limite de tentativas, bloqueio de chamadas de outros sites

## Próximas partes

2. Editor completo, blocos e os 77 temas
3. Pagamentos (Pix direto e gateway)
4. Painel do admin

## Configuração na Cloudflare (resumo)

1. Banco D1 chamado `whitelink-db` e rodar `schema.sql` no console.
2. Projeto Pages ligado a este repositório, com **Build output directory** = `public`.
3. Em Settings → Bindings: D1 com o nome de variável `DB` apontando para `whitelink-db`.
4. Domínio personalizado `whitelink.site`.
5. Variável `SMS_MODE`: enquanto não for `real`, o código de SMS aparece na tela (modo teste).
