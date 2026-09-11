# Publicar o Presença na Vercel

Publicado em 06/09/2026: **https://presenca-qr.vercel.app**.
Projeto `qr-code10/presenca-qr`. Os sete testes locais e a conferência do
endereço HTTPS passaram, incluindo login professor/aluno, QR, histórico e
relatórios. A câmera física deve ser conferida no aparelho.

O projeto usa Node.js 24 e a entrada `api/index.js`, que reutiliza o mesmo
handler HTTP do servidor local. `vercel.json` encaminha todas as rotas para
essa função, preservando as verificações de sessão, CSRF e os arquivos públicos.
O Supabase continua sendo o banco. Não execute migrações nem importe dados ao publicar.

## Variáveis de ambiente

Configure somente no servidor da Vercel, no ambiente Production:

- `DB_PROVIDER=postgres`
- `DATABASE_SCHEMA=presenca`
- `DATABASE_URL`: endereço do pooler transacional, sem senha administrativa.
- `DATABASE_APP_USER`: usuário restrito já usado pelo aplicativo.
- `DATABASE_APP_PASSWORD`: senha desse usuário restrito, como variável sensível.
- `DATABASE_SSL_CA`: conteúdo PEM completo do certificado CA local.
- `COOKIE_SECURE=true`
- `NODEJS_HELPERS=0`

Não envie `DATABASE_PASSWORD`, `ADMIN_PASSWORD`, o `.env` completo, bancos,
logs ou backups. A lista `.vercelignore` exclui esses arquivos. O certificado
é fornecido pela variável, mantendo validação TLS e hostname habilitada.

## Publicação e conferência

Entre com `npx vercel login`, vincule o projeto com `npx vercel link` e confira
os arquivos com `npx vercel deploy --dry --json`. Depois de configurar as
variáveis, publique com `npx vercel --prod`.

Confira a página, os arquivos JS/CSS/leitor, login, sessão, QR e relatórios
no endereço HTTPS. Os convites novos passam a usar o domínio acessado.
O servidor local continua disponível por `npm start`.

O limitador de tentativas continua em memória por instância. Na Vercel,
o endereço do cliente vem do cabeçalho gerenciado pela plataforma; no servidor
local, cabeçalhos de proxy não são considerados confiáveis. Para limitar
tentativas globalmente entre instâncias, configure também o Firewall da Vercel.

Referências: [Node.js](https://vercel.com/docs/functions/runtimes/node-js),
[configuração](https://vercel.com/docs/project-configuration/vercel-json) e
[cabeçalhos](https://vercel.com/docs/headers/request-headers).
