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

O projeto roda como **Worker com arquivos estáticos** (`wrangler.jsonc`):
- `src/worker.js` recebe todas as visitas e chama as funções certas.
- O banco D1 `whitelink-db` e o domínio `whitelink.site` já estão ligados no `wrangler.jsonc`.

1. Banco D1 `whitelink-db` criado e `schema-console.sql` colado no Console.
2. Workers e Pages → Criar → Importar repositório do GitHub `whitelink2`.
3. Comando de implantação: `npx wrangler deploy` (o padrão).
4. Variável `SMS_MODE`: enquanto não for `real`, o código de SMS aparece na tela (modo teste).
