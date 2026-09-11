# Acesso por identificadores e recuperação

**Atualização:** integração gradual com Supabase Auth implementada localmente e migração aditiva aplicada. Publicação e entrega de e-mail aguardam SMTP. Veja [o relatório atual](RECUPERACAO-EMAIL-STATUS.md). As seções abaixo descrevem a implementação anterior, mantida para compatibilidade e testes. Contas novas apenas com CPF são rejeitadas.

Senhas novas aceitam de 8 a 128 caracteres, inclusive espaços, sem regras
de composição. Senhas existentes continuam válidas. O servidor mantém scrypt
com salt individual; nunca grava senha em texto puro.

O Supabase é usado como PostgreSQL privado, não como Supabase Auth.
`users.email` existente foi preservado. Contas sem e-mail recebem um valor
técnico aleatório no domínio reservado `cadastro.invalid`, que não é aceito
no login por e-mail nem retornado pela API. CPF é validado e armazenado como
HMAC; telefone normalizado brasileiro também possui HMAC para unicidade e
uma cópia criptografada AES-256-GCM para eventual envio de recuperação.
O CPF nunca é armazenado em texto puro. Os contatos retornados são mascarados.

`IDENTITY_KEY` é uma chave privada de 32 bytes em base64url. Preserve-a junto
com os backups. Não a substitua sem planejar a migração dos identificadores.
O `.env` e os backups não são enviados para a Vercel.

## Estrutura adicional

Migração `20260906223735_account_access.sql`:

- users: cpf_hash, phone_hash e phone_encrypted, com índices únicos.
- students: student_code único de 10 caracteres, separado do QR.
- password_resets: hash de token, usuário, expiração e marca de uso, com RLS
  exclusiva do backend. Nenhuma tabela anterior foi apagada.

Os telefones antigos permanecem inalterados em students.phone. O script
backfill-account-identifiers.js complementa apenas as novas colunas dos
usuários para telefones válidos. Formatos antigos inválidos são reportados
por ID e preservados; o login antigo por e-mail continua disponível.
Duplicidades válidas interrompem a complementação, sem escolher uma conta.

## Recuperação

O link é aleatório, de uso único e expira após 30 minutos. Somente o hash é
gravado. A URL usa APP_ORIGIN fixo, nunca o Host recebido. O segredo fica no
fragmento e é retirado do endereço ao abrir a tela, não em localStorage.
Redefinir a senha invalida todos os links pendentes e sessões da conta.
As respostas à solicitação não revelam se uma conta existe.

Envio real exige um destes canais configurados:

- E-mail: RESEND_API_KEY e RESET_EMAIL_FROM com remetente verificado.
- SMS: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_FROM.

Não há provedor configurado por padrão. Testes usam transporte simulado;
isso valida o token e a troca da senha, mas não comprova entrega na caixa de
entrada ou aparelho. Conta somente com CPF não possui destino para envio;
é necessário definir um contato de recuperação ou outro mecanismo de posse.

## Conferência

`npm test` inclui cadastro e login pelos três identificadores, normalização,
duplicidade, CPF inválido, código e QR repetidos, recuperação com aluno,
expiração, uso único, revogação de sessões, menu, equipe e relatórios.
`npm run test:postgres` usa schemas temporários isolados.

Referências: [recuperação OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html),
[Resend](https://resend.com/docs/api-reference/emails/send-email),
[Twilio](https://www.twilio.com/docs/messaging/api/message-resource).
