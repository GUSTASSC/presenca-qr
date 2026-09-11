# Retomar o projeto Presença

## Retomada de amanhã — salvo em 06/09/2026

Usuário pediu para salvar e pausar. Não publicar nem continuar configuração durante a pausa.

- Código novo salvo em disco; Supabase Auth ainda não publicado nem ativado. Login da versão online preservado.
- 13 testes locais passaram. Suíte PostgreSQL inicial: 11 passaram; rodada final direcionada: 3 passaram, incluindo catequista migrado e interface de recuperação.
- Auth real: recuperação por prova, redefinição, senha antiga rejeitada, login e logout passaram com conta temporária já removida. Entrega real de e-mail NÃO testada.
- Migração aditiva 20260907001013 aplicada. Dados existentes comparados ao backup, RLS verificado, advisors sem problemas reportados.
- CLI Supabase autenticada. Credenciais somente no .env privado. Não imprimir segredos, não trocar IDENTITY_KEY, não apagar usuários.
- Próximo passo: configurar SMTP em https://supabase.com/dashboard/project/omsyrikdarkjhqscbowp/auth/smtp. Faltam os dados do provedor (host, porta, usuário, senha e remetente).
- Depois, executar scripts/configure-auth-flow.js para instalar o template; habilitar Auth em ambiente de validação; testar entrega e fluxo completo antes de publicar na Vercel.
- Telefone sem e-mail continua aceito, sem recuperação automática. Cadastro apenas com CPF é bloqueado no código novo. E-mail precisa de prova de posse, não confirmação manual.
- Consulte RECUPERACAO-EMAIL-STATUS.md para arquivos, backups e detalhes. As notas históricas abaixo não substituem estas decisões.

Uma cópia final dos arquivos foi preparada em data/backups/continuar-amanha-*, sem node_modules e sem duplicar os backups anteriores. Os snapshots dos bancos permanecem em data/backups.

**Última etapa:** Supabase Auth implementado localmente, migração 20260907001013 aplicada e dados comparados com backup. Sem deploy. SMTP ausente impede instalar template e validar entrega. Flags Auth e recovery permanecem false no .env. Leia RECUPERACAO-EMAIL-STATUS.md antes de continuar; as notas de publicação abaixo são da versão anterior.

## O que já funciona

- Aplicativo web em português, Node.js 24+, QR Code de presença e registro de missa.
- PostgreSQL no Supabase como banco padrão desta máquina; SQLite mantido como alternativa.
- Login, cadastro de alunos por convite, aprovação, QR PNG, chamadas, histórico, CSV e relatórios.
- Vários catequistas na mesma turma: **Turmas → Catequistas**.
- O responsável pela turma gera um convite para o e-mail de cada colega. Cada
  catequista cria sua senha ou usa a conta existente. Convite de uso único, com
  validade de 7 dias, vinculado ao e-mail. O link deve ser enviado manualmente.
- Todos da equipe compartilham alunos, aprovações, chamadas, missa e relatórios.
  A auditoria identifica o autor. Remover alguém preserva o histórico e encerra
  somente seu acesso à turma. Outras turmas continuam privadas.

## Histórico da publicação anterior

Atualização de acesso publicada: dpl_Gcz9yHqggorby6GQPKkNmqd1YR6v, no mesmo
https://presenca-qr.vercel.app. Senha mínima 8, cadastro/login por CPF, telefone
ou e-mail, código próprio do aluno e menu corrigido. Migração
20260906223735_account_access.sql aplicada; dados anteriores comparados com
backup e preservados. Dez testes locais passaram; testes PostgreSQL isolados
e conferência HTTPS também passaram. Leia ALTERACOES-ACESSO.md e ACCOUNTS.md.
IMPORTANTE: recuperação tem backend/interface testados com envio simulado,
mas nenhum provedor real configurado. Aguardar usuário informar serviço de
e-mail/SMS e decidir recuperação para conta cadastrada somente com CPF.
IDENTITY_KEY está no .env e nas variáveis protegidas da Vercel; não trocar
essa chave sem migração. Dois telefones antigos foram complementados nas novas
colunas; telefone inválido do usuário 14 foi preservado sem habilitar login
por telefone. O acesso antigo por e-mail continua funcionando.

Publicado na Vercel em 06/09/2026: https://presenca-qr.vercel.app.
Projeto qr-code10/presenca-qr, conta gustassc; vínculo local em .vercel/.
Deploy dpl_GQSk1zyzWCESvJmTLS5N5uTnShMK. Sete testes locais passaram.
Conferência no HTTPS de produção: arquivos públicos, bloqueio de arquivos
privados, login professor/aluno, cookies Secure/HttpOnly, QR, histórico e
relatórios passaram. Turmas, alunos e chamadas não foram alterados.
Variáveis de produção usam somente o usuário restrito do Supabase, com CA
em DATABASE_SSL_CA. A senha administrativa não foi enviada. Leia VERCEL.md.
Próximas alterações são publicadas por npx vercel deploy --prod; ainda não
há publicação automática por GitHub. O site funciona com este PC desligado.

Atualização de 06/09: fluxo rápido de QR e missa implementado. A presença é
salva imediatamente; SIM/NÃO/DEPOIS aparecem na mesma tela e as leituras
aguardam a resposta. Encerramento mostra somente missa não informada, com
botões por aluno. Usa attendance.mass existente; nenhuma migração de banco.
Backup prévio em data/backups/qr-missa-before-20260906-182809 e snapshot
PostgreSQL presenca-2026-09-06T21-28-47.008Z.json, além do backup SQLite.
Teste dedicado: test/qr-mass.test.js. Os comandos de teste agora limitam a
busca a test/*.test.js para não executar cópias guardadas em backups.
Validação: cinco testes locais passaram; os quatro testes anteriores e o
novo teste QR/missa também passaram no PostgreSQL em schemas isolados.
Comparação com o snapshot confirmou dados anteriores preservados (sessões
e histórico de migração excluídos dessa comparação). Câmera física continua
dependendo de conferência no celular por HTTPS. Reinicie o servidor Node
que estiver aberto e atualize a página para carregar a nova versão.

O usuário quer usar a mesma turma com quatro catequistas. A funcionalidade já
foi implementada, testada e aplicada no Supabase. Falta o usuário convidar os
outros catequistas pela interface; não foram criadas contas reais para eles.

O usuário perguntou se o convite chega por e-mail. **Não há envio automático**:
o e-mail identifica o destinatário e o link é copiado ou compartilhado pelo
WhatsApp. Recuperação de senha por mensagem foi solicitada depois; a implementação
está pronta, mas ainda falta configurar o serviço de envio.

## Iniciar amanhã nesta máquina

```powershell
cd "C:\projetos\app qr code"
npm.cmd start
```

Abra http://localhost:3000. O `.env` local já contém a configuração do Supabase
e a senha do usuário restrito. Esse arquivo e o certificado local não devem ser
apagados. Não é necessário executar a migração nem importar a demonstração novamente.

Conta de demonstração do responsável: `professor@demo.local`, senha `Demo@2026!`.
Conta de demonstração da aluna: `aluno@demo.local`, mesma senha.

Para testar mudanças locais no celular, é possível recriar um túnel HTTPS temporário. O link da
sessão anterior deixará de funcionar quando a máquina ou o túnel for desligado.
O executável Cloudflared está em `data/tools/cloudflared.exe` nesta máquina.
Em um terminal, abra a instância para HTTPS:

```powershell
$env:COOKIE_SECURE='true'
$env:PORT='3001'
$env:HOST='127.0.0.1'
node server.js
```

Em outro terminal:

```powershell
.\data\tools\cloudflared.exe tunnel --url http://127.0.0.1:3001 --no-autoupdate
```

Copie o novo endereço HTTPS exibido. O túnel é de teste, não uma publicação
permanente. Para usar a versão publicada, abra https://presenca-qr.vercel.app.

## Banco, migrações e backups

- Schema privado: `presenca`. Login do aplicativo continua sendo gerenciado
  pelo Node, não pelo Supabase Auth.
- `20260906011032_presenca_initial.sql`: estrutura original.
- `20260906020331_shared_catechists.sql`: equipes, convites, view de acesso e
  escopo da turma na auditoria. Não modificar migrações já aplicadas.
- Histórico próprio em `presenca._migrations`, com checksums. Não misturar com
  `supabase db push`. Novas migrações são aplicadas com `npm.cmd run db:migrate`.
- `db:migrate` faz backup SQLite e snapshot PostgreSQL antes das alterações.
- Backups e logs locais ficam em `data/`, fora do GitHub. O SQLite original não
  foi apagado. Os dados atuais do aplicativo ficam persistidos no Supabase.
- `npm.cmd run start:sqlite` usa o banco local preservado; não sincroniza novas
  gravações do Supabase. Consulte `SUPABASE.md` antes de voltar ao SQLite.

## Validação realizada

- Quatro testes locais passaram: fluxo, interface, concorrência/integridade e
  equipe de quatro catequistas.
- Os quatro também passaram no PostgreSQL em schemas temporários. O teste de
  interface foi repetido após corrigir um seletor que encontrava botão em modal fechado.
- Convites novos e para contas existentes, acesso compartilhado, autoria,
  expiração, cancelamento e revogação foram verificados.
- Após a migração de equipes, os dados anteriores foram comparados com o
  snapshot, sem perda ou alteração das colunas anteriores.
- Advisors oficiais: nenhum apontamento retornado.
- Login e listagem da equipe foram conferidos no localhost e no túnel HTTPS.
- Câmera física e impressão exigem conferência no aparelho; a interface
  automatizada usa DOM simulado.

```powershell
npm.cmd test
npm.cmd run test:postgres
```

Os testes PostgreSQL requerem rede e credenciais de manutenção, criam seus
próprios schemas `presenca_test_*` e os removem ao finalizar. Não executam reset
na turma atual. `db:verify:demo` só é adequado para uma demonstração intocada;
os cadastros e alterações feitos pelo usuário podem mudar suas contagens.

## Arquivos principais

- `server.js`: API, sessões, regras e autorização.
- `lib/database.js`: adaptadores SQLite/PostgreSQL e transações.
- `lib/catechists.js`: convites e gestão da equipe.
- `lib/postgres-migration.js`: migrações, isolamento e importação de demonstração.
- `public/app.js`: interface, convites e leitura de QR.
- `README.md` e `SUPABASE.md`: operação e detalhes do banco.

## O que não vai ao GitHub

`.env`, credenciais, bancos, snapshots, logs, executáveis e `node_modules` ficam
somente na máquina. Em outra máquina, execute `npm.cmd install` e configure um
`.env` a partir de `.env.example`; as credenciais devem ser transferidas por
um meio privado. O Supabase mantém os dados mesmo com este computador desligado.
