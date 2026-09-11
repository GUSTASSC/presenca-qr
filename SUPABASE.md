# PostgreSQL no Supabase

O servidor suporta PostgreSQL e SQLite. `DB_PROVIDER=postgres` seleciona o
Supabase; `DB_PROVIDER=sqlite` seleciona `data/presenca.sqlite`. Não existe
troca automática de banco quando a conexão falha, evitando gravações divergentes.

## Estado validado

- Schema privado `presenca`, com 10 tabelas do aplicativo, `_migrations` e a view `teacher_classes`.
- Demonstração importada de um SQLite novo em memória: 11 contas, 10 alunos,
  1 turma, 2 chamadas encerradas e 14 registros de presença/missa.
- Comparação de todos os registros importados, incluindo IDs, senhas já
  criptografadas, tokens de QR e datas. As sequências continuam após os IDs importados.
- Fluxo HTTP, interface com DOM simulado, concorrência entre duas instâncias,
  transações, CSV, QR PNG, regras de missa e isolamento entre professores/alunos
  passaram no PostgreSQL e no SQLite.
- A demonstração do schema `presenca` foi conferida diretamente com login de
  professor e aluno, histórico, QR e relatórios. Os advisors oficiais retornaram
  `results: []` (relatório em `data/backups/postgres-advisors.json`).

O SQLite original não foi importado nem apagado. Somente a demonstração gerada
foi transferida; alterações locais anteriores não são sincronizadas. Os dados
dos testes automatizados ficam em schemas aleatórios `presenca_test_*`,
removidos ao final da respectiva execução.

## Executar

```powershell
npm.cmd start
```

Abra http://localhost:3000. O console identifica o banco selecionado.
Professor: `professor@demo.local`; aluna: `aluno@demo.local`.
Senha de demonstração: `Demo@2026!`.

As seguintes variáveis ficam exclusivamente no `.env` do servidor:

```dotenv
DB_PROVIDER=postgres
DATABASE_SCHEMA=presenca
DATABASE_URL=postgresql://postgres.PROJETO:[YOUR-PASSWORD]@HOST:6543/postgres
DATABASE_PASSWORD="senha administrativa para manutenção"
DATABASE_SSL_CA_PATH=./supabase-ca.crt
DATABASE_APP_USER=presenca_app.PROJETO
DATABASE_APP_PASSWORD="gerada automaticamente por db:migrate"
```

O aplicativo conecta como `presenca_app`, sem privilégios administrativos,
sem criação de tabelas e sem exclusão de alunos ou auditoria. A senha administrativa
é usada apenas pelos scripts de manutenção/teste. Em um ambiente de execução
separado, ela pode ser omitida; mantenha as credenciais restritas do aplicativo.
Nunca coloque essas variáveis em `public/` ou use prefixos públicos.

O certificado CA é validado, inclusive o hostname. Seu caminho relativo é resolvido
a partir da pasta do projeto. O pooler transacional usa `prepare: false` e até
3 conexões por processo. O schema e os limites das consultas são configurados
localmente em cada transação, sem depender de sessões persistentes no pooler.

## Estrutura e segurança

O arquivo `supabase/migrations/20260906011032_presenca_initial.sql` cria tabelas,
chaves estrangeiras, índices, unicidade de chamada/aluno, validação da aprovação
antes de inserir presença e RLS. Datas usam `date`/`timestamptz`; flags mantêm
0/1 com restrições para preservar o contrato da interface e o retorno ao SQLite.

A migração `20260906020331_shared_catechists.sql` adiciona equipes e convites,
sem recriar turmas, alunos ou chamadas. O criador continua responsável pela
turma e aparece automaticamente na view de acesso. A view usa
`security_invoker=true`; as novas tabelas mantêm RLS e acesso somente pelo
servidor. A auditoria passa a guardar a turma da alteração para compartilhá-la
com a equipe autorizada, mantendo o usuário que fez a ação.

O schema não é exposto pela Data API. `anon`, `authenticated` e `service_role`
não recebem acesso. As políticas são exclusivas do papel confiável do servidor;
as permissões por professor/aluno continuam sendo verificadas pela API Node,
com o login e os cookies existentes. Esta migração não adota Supabase Auth.

Mutações são transacionais e serializadas por schema com advisory lock para
preservar a ordem do SQLite entre múltiplas instâncias. A resposta de sucesso
só é enviada após o commit. Leituras usam snapshots consistentes. O relatório
consulta as presenças em lote e usa limites de data compatíveis com os índices.
Essa serialização prioriza integridade para o volume atual; alta concorrência
de gravações poderá exigir locks mais específicos no futuro.

## Comandos de manutenção

```powershell
npm.cmd run db:backup
npm.cmd run db:check
npm.cmd run db:migrate
npm.cmd run db:migrate:demo
npm.cmd test
npm.cmd run test:postgres
npm.cmd run db:verify:demo
```

`db:backup` usa a API de backup online do SQLite, incluindo registros no WAL,
e confere `PRAGMA integrity_check` no arquivo resultante. Cópias ficam em
`data/backups/`, ignorado pelo Git. Há também uma cópia do servidor anterior.

`db:migrate` faz backup SQLite e um snapshot JSON transacional das tabelas
PostgreSQL existentes em `data/backups/` antes de aplicar alterações. Pode
ser repetido: valida a versão e o checksum em `presenca._migrations`. Recusa
schemas desconhecidos ou um checksum diferente. O servidor não executa DDL
na inicialização em PostgreSQL. A aplicação desta migração usa o cliente Node
com o mesmo certificado TLS validado; seu histórico é próprio, não o histórico
automático da CLI Supabase. Não misture `supabase db push` com esse histórico.

`db:migrate:demo` só importa se todas as tabelas estiverem vazias. Se houver
dados, cancela sem substituí-los. Não é um comando para restaurar/resetar o
banco. `db:verify:demo` pressupõe a demonstração original e encerra as sessões
que cria. `test:postgres` requer as credenciais administrativas para criar e
remover apenas seus próprios schemas temporários; nunca faz reset em `presenca`.

## Voltar ao SQLite

1. Pare o servidor atual com Ctrl+C.
2. Execute `npm.cmd run start:sqlite`.
3. Para manter essa escolha nos próximos `npm start`, defina `DB_PROVIDER=sqlite`.

Esse comando usa o SQLite original, que permanece em `data/presenca.sqlite`.
Não é necessário sobrescrevê-lo com o backup. Para voltar ao Supabase, use
`DB_PROVIDER=postgres` e reinicie com `npm.cmd start`.

Novas gravações feitas no PostgreSQL não aparecem no SQLite antigo. Se já
houver dados novos que precisem ser preservados, suspenda gravações e planeje
a exportação antes da volta; este procedimento não faz sincronização reversa.
Não apague nenhum dos bancos durante essa conferência.

## Publicação e limites da validação

A mudança do banco não publica o aplicativo nem adapta o servidor HTTP para
uma plataforma específica. Em HTTPS, configure `COOKIE_SECURE=true`. Leitura
pela câmera física e impressão em PDF precisam ser conferidas no aparelho;
os testes de interface usam DOM simulado. Os dados e contas de demonstração
não devem ser usados como instalação real.

Referências: [conexão e SSL](https://supabase.com/docs/guides/database/connecting-to-postgres),
[papéis PostgreSQL](https://supabase.com/docs/guides/database/postgres/roles),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
