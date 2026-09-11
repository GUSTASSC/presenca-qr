import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from '../lib/supabase-db.js';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
let sql;
try {
  sql = connectDatabase();
  await sql`select 1 as connection_ok`;
  console.log('Conexão segura com PostgreSQL confirmada. Nenhuma tabela ou dado foi alterado.');
} catch (error) {
  // Do not log the raw error: drivers can include connection credentials.
  const code = String(error.code || 'CONFIG_OR_CONNECTION').replace(/[^A-Z0-9_]/g, '').slice(0, 40);
  console.error(`Não foi possível conectar (${code}). Confira DATABASE_URL, DATABASE_PASSWORD e o acesso à rede. Nenhuma credencial foi exibida.`);
  process.exitCode = 1;
} finally {
  if (sql) await sql.end({ timeout: 5 });
}
