# Alterações de acesso — 06/09/2026

Publicado: https://presenca-qr.vercel.app
Deploy: dpl_Gcz9yHqggorby6GQPKkNmqd1YR6v.

## Concluído

- Senhas novas de 8 a 128 caracteres, sem regras de composição.
- Cadastro/login por e-mail, telefone ou CPF, com validação e unicidade.
- CPF armazenado por HMAC; telefone novo criptografado e retornado mascarado.
- Código único do aluno, independente do QR, no painel e na conferência.
- Chamada por código com o mesmo fluxo de presença e missa do QR.
- Menu fecha por toque fora, botão, Esc e navegação.
- Recuperação com token de uso único de 30 minutos e revogação de sessões;
  integração preparada para Resend ou Twilio.

## Pendente para concluir recuperação real

Nenhum serviço de e-mail/SMS foi fornecido/configurado. **A recuperação ainda
não envia mensagens em produção.** Os testes usam transporte simulado.
Falta configurar remetente e credenciais no servidor e conferir a entrega
com conta de aluno com contato real autorizado para o teste.

Cadastro somente com CPF continua permitido, conforme solicitado. CPF não é
destino de mensagem: falta decidir se será obrigatório um contato de
recuperação ou outro mecanismo de posse. Não usamos perguntas pessoais nem
o conhecimento do CPF como prova de identidade.

## Banco e preservação

Migração: supabase/migrations/20260906223735_account_access.sql.
Novas colunas: users.cpf_hash, users.phone_hash, users.phone_encrypted e
students.student_code. Nova tabela: password_resets, com RLS exclusiva do
backend e índices. Nenhuma tabela anterior foi apagada.

Dois telefones antigos válidos receberam índices protegidos para login. Um
telefone antigo inválido (usuário 14) foi preservado, mantendo o login por
e-mail. Os valores anteriores em students.phone não foram reformatados.

Backups dos arquivos: data/backups/accounts-before-20260906-193150.
Snapshot: data/backups/presenca-2026-09-06T22-50-44.854Z.json.
SQLite: data/backups/presenca-2026-09-06T22-50-40.728Z.sqlite.
Comparação das colunas anteriores passou (sessões e histórico de migração
excluídos). Advisors oficiais não retornaram apontamentos.

## Testes aprovados

Dez testes locais. A suíte PostgreSQL foi executada em schemas temporários;
contas e recuperação pela interface foram repetidas após os ajustes.

- CPF válido/inválido; telefone normalizado; proteção dos identificadores.
- Cadastro e login pelos três identificadores; duplicidades bloqueadas.
- Senha simples de 8 caracteres; senha curta rejeitada.
- Recuperação de aluno via API/interface com envio simulado, confirmação de
  senha, expiração, uso único e invalidação das sessões/senha antiga.
- QR e código digitado; duplicidade entre os dois meios bloqueada.
- SIM/NÃO/DEPOIS, revisão final e falha ao salvar missa.
- Menu com largura móvel simulada: clique fora, botão, Esc, navegação e
  retorno à largura de computador sem sobreposição residual.
- Catequistas, permissões, convites, relatórios, histórico e CSV.
- Produção HTTPS: login professor/aluno, QR PNG, código, campos sensíveis
  ocultos e arquivos privados inacessíveis.

Câmera física e layout no aparelho exigem conferência no celular. O teste
do menu usa DOM simulado, não captura de tela real.

## Arquivos alterados/adicionados

- server.js; api/index.js; public/app.js; public/style.css.
- lib/identifiers.js; lib/recovery.js; lib/sqlite-accounts.js;
  lib/database.js; lib/postgres-migration.js.
- supabase/migrations/20260906223735_account_access.sql.
- test/accounts.test.js; test/recovery-ui.test.js; test/flow.test.js;
  test/qr-mass.test.js; test/ui.test.js; test-support/database.js.
- scripts/prepare-identity-key.js; scripts/backfill-account-identifiers.js;
  scripts/configure-account-env.js; scripts/verify-deployment.js.
- package.json; package-lock.json; .env.example; .env local (chave privada).
- ACCOUNTS.md; ALTERACOES-ACESSO.md; README.md; RETOMAR.md.

@vercel/functions mantém os envios em segundo plano após o commit do token.
