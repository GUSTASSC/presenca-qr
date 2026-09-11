import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Server only. Never import this module from public/.
export function connectDatabase(env = process.env, { application = false } = {}) {
  if (!env.DATABASE_URL) throw new Error('Configure DATABASE_URL no arquivo .env.');
  const url = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL deve ser uma conexão PostgreSQL.');
  }
  if (!application && !env.DATABASE_PASSWORD && (!url.password || url.password.includes('YOUR-PASSWORD'))) {
    throw new Error('Configure DATABASE_PASSWORD com a senha do banco.');
  }
  if (application && (!env.DATABASE_APP_USER || !env.DATABASE_APP_PASSWORD)) {
    throw new Error('Execute db:migrate para configurar o usuário restrito do aplicativo.');
  }
  return postgres(env.DATABASE_URL, {
    ...(env.DATABASE_PASSWORD ? { password: env.DATABASE_PASSWORD } : {}),
    ...(application ? { username: env.DATABASE_APP_USER, password: env.DATABASE_APP_PASSWORD } : {}),
    ssl: env.DATABASE_SSL_CA || env.DATABASE_SSL_CA_PATH
      ? { ca: env.DATABASE_SSL_CA || readFileSync(path.resolve(fileURLToPath(new URL('../', import.meta.url)),env.DATABASE_SSL_CA_PATH), 'utf8'), rejectUnauthorized: true }
      : 'verify-full',
    prepare: false,
    max: 3,
    connect_timeout: 15,
    idle_timeout: 20,
    max_lifetime: 60 * 10,
    onnotice: () => {},
    types: {
      safeInteger: { to: 20, from: [20], serialize: String, parse: value => {
        const number = Number(value);
        if (!Number.isSafeInteger(number)) throw new Error('Inteiro fora do limite seguro.');
        return number;
      } },
      dateString: { to: 1082, from: [1082], serialize: String, parse: String },
      timestampString: { to: 1184, from: [1184], serialize: String, parse: value => new Date(value).toISOString() },
    },
  });
}
