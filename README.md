# Presença

Versão online: **https://presenca-qr.vercel.app**. Publicação e configuração
documentadas em [VERCEL.md](VERCEL.md).

Atualização de acesso: senha mínima de 8 caracteres, login/cadastro por e-mail,
telefone ou CPF e código próprio do aluno como alternativa ao QR. Consulte
[ALTERACOES-ACESSO.md](ALTERACOES-ACESSO.md) para arquivos, migração e testes.
A recuperação de senha depende de configurar o serviço de envio; detalhes
em [ACCOUNTS.md](ACCOUNTS.md).

Aplicativo web em português do Brasil para presença por QR Code e participação na missa. Interface responsiva, servidor Node.js e banco PostgreSQL no Supabase, com SQLite disponível para retorno. Os dados não ficam no localStorage: professor e aluno acessam o mesmo servidor.

A migração, os testes e o procedimento para voltar ao SQLite estão em [SUPABASE.md](SUPABASE.md). `DB_PROVIDER` seleciona o banco; `npm.cmd run start:sqlite` força o banco local preservado.

## Executar a demonstração

Requisito: Node.js 24 ou superior.

```powershell
npm install
npm run demo
```

Abra **http://localhost:3000**.

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Professor | professor@demo.local | Demo@2026! |
| Aluna aprovada | aluno@demo.local | Demo@2026! |
| Aluno pendente | aluno8@demo.local | Demo@2026! |
| Aluno rejeitado | aluno10@demo.local | Demo@2026! |

A demonstração cria uma turma, 10 alunos (7 aprovados, 2 pendentes e 1 rejeitado) e duas chamadas encerradas em setembro de 2026. Selecione esse mês para consultar o relatório de exemplo. Os demais alunos usam aluno2@demo.local até aluno9@demo.local, com a mesma senha de demonstração. O comando só insere exemplos se o banco estiver vazio; reiniciar não apaga os dados.

## Fluxo principal

1. Entre como professor e crie uma turma em **Turmas**.
2. Abra **Convite** e copie o link. Para testar outro perfil, abra o convite em uma janela privativa.
3. O aluno informa nome, e-mail, senha e aceite. Os demais campos são opcionais nesta versão.
4. O aluno já pode entrar para acompanhar o status, mas não recebe QR Code nem entra nas chamadas enquanto está pendente.
5. Em **Cadastros pendentes**, o professor confere os dados, escolhe a turma e aprova ou rejeita. O aviso de aprovação aparece no painel do aluno ao atualizá-lo; não há envio de e-mail ou WhatsApp automático.
6. O aluno salva o QR Code em PNG. O professor também pode visualizar, baixar, imprimir e substituir o código.
7. Em **Fazer chamada**, selecione turma e data. Abra a câmera: cada leitura salva a presença e mostra o nome do aluno com “Presença registrada”.
8. Responda **Foi à missa?** nos botões grandes **SIM**, **NÃO** ou **DEPOIS**. O leitor volta automaticamente após a escolha. DEPOIS mantém Não informado, sem apagar uma resposta já existente. A edição individual e as ações em lote continuam disponíveis.
9. Em **Encerrar chamada**, revise somente alunos com missa **Não informado**, usando SIM ou NÃO. É possível voltar à chamada ou encerrar mantendo pendências. A regra de missa somente para presentes continua sendo respeitada. Confirme o encerramento: quem não foi registrado passa a ausente.
10. Consulte **Histórico** e **Relatórios**. O CSV inclui resumo e todas as datas do mês. **Salvar em PDF** abre a impressão do navegador: selecione “Salvar como PDF”.

O QR Code substituído deixa de funcionar imediatamente. Tokens não contêm nome, e-mail nem outros dados pessoais. A câmera permanece aberta após cada leitura. Há inserção manual do conteúdo do QR como alternativa de operação/teste.

## Vários catequistas na mesma turma

Em **Turmas → Catequistas**, o responsável que criou a turma informa o e-mail
de cada colega e gera um convite. Copie o link ou abra o WhatsApp para enviá-lo.
Não há envio automático. Repita para os outros três catequistas da equipe.

Cada convidado abre o link, informa seu nome e escolhe sua senha. Quem já tem
uma conta de catequista usa a senha existente. O convite é exclusivo daquele
e-mail, vale por 7 dias e é de uso único; gerar outro para o mesmo e-mail cancela
o anterior. Contas de alunos não são convertidas em catequistas.

Todos compartilham alunos, aprovações, QR Codes, chamadas, missa, correções e
relatórios da turma. Cada um mantém seu login. Em **Histórico → Auditoria**,
a equipe pode conferir quem fez cada alteração. As outras turmas de um
catequista continuam privadas. Atualize a página para carregar alterações
feitas por outro catequista; não há atualização automática em tempo real.

Somente o responsável gerencia convites e remove catequistas. A remoção corta
o acesso àquela turma, mas preserva a conta, as outras turmas e a auditoria.

## Usar no celular

O acesso à câmera exige **HTTPS** (ou localhost no próprio aparelho). Para celulares distintos, publique o servidor atrás de um proxy HTTPS e use o endereço HTTPS ao gerar os convites. Um endereço HTTP da rede local permite consultar telas, mas normalmente não libera a câmera. O link do convite usa o endereço pelo qual o professor acessou a aplicação.

## Instalação sem dados fictícios

Use uma instalação com banco vazio. Copie `.env.example` para `.env` e defina `ADMIN_EMAIL`, `ADMIN_PASSWORD` (mínimo de 8 caracteres) e `ADMIN_NAME`. Rode `npm start`, sem `--seed`. O primeiro professor é criado apenas se o banco estiver vazio. Remova a senha inicial do arquivo após a criação. Não exponha as contas de demonstração na instalação real.

Defina `COOKIE_SECURE=true` no ambiente servido por HTTPS; o proxy deve preservar o cabeçalho Host original. Configure backups do diretório `data`, permissões de acesso ao arquivo do banco e restauração antes de usar dados reais. O banco fica em `data/presenca.sqlite`, com WAL habilitado. Para uma cópia simples consistente, pare o servidor e copie todo o diretório `data`.

## Regras e segurança implementadas

- Senhas com scrypt e salt individual; sessões de 12 horas em cookies HttpOnly/SameSite, tokens de sessão armazenados como hash, proteção CSRF e limitação de tentativas de login/cadastro.
- Autorização no servidor: catequista acessa as turmas que criou ou cuja equipe integra; aluno acessa somente seus dados, QR Code e histórico autorizado.
- E-mail único, telefone normalizado para detectar duplicatas no cadastro, convite aleatório renovável/desativável e com validade opcional.
- QR Code aleatório de 256 bits, revogação por substituição e validação de aprovação, situação ativa e turma durante a leitura.
- Restrição UNIQUE para aluno/chamada, transações e trigger para impedir inserção de pendentes, inativos ou alunos de outra turma.
- A lista de uma chamada é congelada na abertura. Alunos aprovados depois entram nos próximos encontros. Transferências e desativações não apagam registros anteriores.
- Relatório oficial considera alunos atualmente aprovados e ativos da turma, somente chamadas encerradas e somente encontros em cuja lista inicial cada aluno aparece. O histórico continua preservando os demais registros.
- Alterações de presença/missa, encerramento, aprovação, mudanças de turma e substituição de QR ficam auditadas com usuário, data e valores relevantes. O horário original de leitura não é alterado por uma correção manual.
- A regra “missa somente para presentes” é configurável por turma e validada no servidor.

## Validação

```powershell
npm test
```

`npm test` executa dez testes no SQLite em memória; `npm.cmd run test:postgres` executa os mesmos testes em schemas temporários isolados no Supabase. Cobrem convite → cadastro → aprovação → PNG → leitura → missa → encerramento → relatório, duplicidades, QR revogado, separação entre professores/alunos, restrição de missa, histórico, rollback de operações em lote, concorrência, CSV e permissões do banco. Os testes de interface usam DOM simulado, incluindo SIM/NÃO/DEPOIS, pausa das leituras, erro de conexão e revisão das missas pendentes. Os testes incluem uma equipe de quatro catequistas, convites, revogação e autoria das alterações. A leitura por câmera física e a impressão em PDF precisam ser conferidas no aparelho de destino, por HTTPS.

## Escopo desta primeira versão

Inclui os 14 itens do fluxo inicial, com PDF via impressão do navegador. Não há serviço de mensagens: pendências e decisões são avisadas nos painéis. Convites são links seguros; envio pelo WhatsApp abre uma mensagem para o professor enviar. Cadastro geral sem convite, códigos numéricos de convite, folha com vários QRs, filtros avançados por período, edição de todos os campos cadastrais, exclusão/anonimização pela interface ficam para a próxima etapa. A política exibida no cadastro é um texto inicial que deve ser ajustado à instituição responsável antes de uso real.

## Arquivos

- `server.js`: banco, autenticação, autorização, regras e API.
- `public/app.js`: telas e leitura contínua por câmera.
- `public/style.css`: layout responsivo e impressão.
- `test/flow.test.js`: teste de integração.

Esta aplicação opera online, com dados compartilhados no Supabase. A versão
publicada na Vercel funciona independentemente do computador local. Não há
sincronização offline nem publicação automática das próximas alterações.
