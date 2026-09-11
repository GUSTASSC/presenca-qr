# Supabase Auth: código pronto, ativação pendente de SMTP

Atualizado em 06/09/2026, horário de Brasília. Não houve novo deploy.

## Integração

Migração gradual por recuperação de e-mail verificada. Contas não vinculadas continuam usando scrypt; contas somente com telefone continuam funcionando sem recuperação automática. Cadastro novo exige e-mail ou telefone mesmo usando CPF.

O servidor prepara uma identidade Auth sem confirmar artificialmente o e-mail e chama `resetPasswordForEmail`. A resposta não revela se a conta existe. Ao abrir o link, o aluno toca em Continuar. O servidor usa `verifyOtp` com tipo recovery, confere o e-mail verificado e vincula o ID Auth à conta local.

A vinculação revoga sessões locais e invalida o hash antigo ANTES da alteração remota. Depois, `updateUser` define a senha no Supabase. Essa ordem impede que uma falha de rede ou banco reabilite a senha antiga. Contas vinculadas usam `signInWithPassword`, com conferência do ID; não há fallback ao hash antigo. Convites de catequistas também usam a senha Auth quando a conta já migrou.

A sessão Supabase de login é encerrada após validar a senha; o aplicativo mantém sua própria sessão HttpOnly. Logout remove essa sessão. A redefinição encerra as sessões Supabase e locais da conta.

Chaves e tokens de sessão Supabase ficam no servidor. O token temporário de redefinição tem uso único e 15 minutos de validade; apenas o hash é armazenado. A sessão remota pendente é criptografada AES-GCM com IDENTITY_KEY e removida ao consumir a redefinição. O link é retirado da barra de endereço e não vai para localStorage. Nenhuma senha é armazenada em texto puro.

## Banco e backup

Migração aditiva aplicada: `supabase/migrations/20260907001013_supabase_auth_bridge.sql`:
- users.supabase_user_id: vínculo único, inicialmente nulo.
- users.email_verified_at: preenchido somente após comprovação do e-mail.
- password_resets.auth_session: sessão temporária criptografada.
- SQLite tem migração equivalente. Nenhuma tabela ou usuário existente foi apagado. RLS e grants privados preservados.

Backups:
- Arquivos: `data/backups/supabase-auth-before-20260906-210908`.
- PostgreSQL: `data/backups/presenca-2026-09-07T00-18-42.707Z.json`.
- SQLite: `data/backups/presenca-2026-09-07T00-18-38.352Z.sqlite`.
- Configuração Auth: `data/backups/auth-config-before.json` e cópias com timestamp.

Comparação com snapshot passou para todas as colunas anteriores (exceto sessões e histórico de migração). Auditoria: 12 tabelas privadas com RLS; advisors sem problemas reportados.

## Testes

- 13 testes locais passaram: cadastro, menu, QR/missa, código manual, relatórios, autenticação, recuperação, redefinição, logout e catequista migrado.
- Suíte PostgreSQL inicial: 11 testes passaram; os testes adicionados depois foram executados separadamente.
- Supabase real: prova recovery autêntica, redefinição, rejeição da senha antiga, login e logout passaram em conta temporária isolada, removida ao terminar. Nenhum usuário existente foi removido.
- A prova real foi gerada administrativamente SEM envio de e-mail. Entrega na caixa de entrada ainda não testada.
- Produção atual verificada após migração: login de professor/aluno, sessão HTTPS, consultas e arquivos privados passaram.

## SMTP e ativação

Projeto `omsyrikdarkjhqscbowp`, GUSTASSC's Project.

SMTP está ausente. O Supabase recusou personalizar o template porque o projeto usa plano gratuito e provedor padrão. O envio padrão também não atende alunos fora da equipe do projeto.

Abra https://supabase.com/dashboard/project/omsyrikdarkjhqscbowp/auth/smtp — Authentication → Email → SMTP Settings. Ative Custom SMTP e informe remetente, nome Presença, host, porta, usuário e senha fornecidos pelo provedor. Insira a senha diretamente no painel, nunca no frontend ou no chat.

Depois de configurar SMTP:
1. Execute `node scripts/configure-auth-flow.js`. Site URL, redirect e mínimo de 8 caracteres já foram configurados; o template `supabase/recovery-email.html` aguarda SMTP para ser instalado.
2. Preserve a confirmação de e-mail ativa. Não confirme manualmente os alunos.
3. Habilite SUPABASE_AUTH_ENABLED=true e SUPABASE_RECOVERY_ENABLED=true no ambiente de validação. Credenciais estão somente no `.env` privado; ambos os flags continuam false nesta entrega.
4. Valide envio e abertura com destinatário de teste autorizado e o novo código. A versão publicada ainda usa o código anterior.
5. Configure as variáveis privadas na Vercel e publique somente após validar entrega e fluxo completo.

Após vincular contas, desativar Auth bloqueará seu login por segurança. Não restaure backups sobre dados atuais como rollback; preserve os vínculos e o serviço Auth.

## Arquivos

- Alterados: server.js, lib/catechists.js, lib/recovery.js, lib/sqlite-accounts.js, public/app.js, package.json, package-lock.json, .env.example e .env privado.
- Novos: lib/supabase-auth.js, lib/auth-recovery.js, migração SQL, supabase/recovery-email.html.
- Testes: test-support/database.js, test/supabase-auth.test.js, test/auth-recovery-ui.test.js.
- Scripts: inspect-auth-config.js, prepare-auth-env.js, configure-auth-flow.js, test-auth-live.js.
- Documentação: este relatório, ACCOUNTS.md, RETOMAR.md.

Referências: https://supabase.com/docs/guides/auth/auth-smtp e https://supabase.com/docs/guides/auth/auth-email-templates.
