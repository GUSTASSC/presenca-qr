import '../server.js';
import {connectDatabase} from '../lib/supabase-db.js';
import {backupPostgres} from './backup-postgres.js';
import {backupSQLite} from './backup-sqlite.js';
console.log('SQLite:',await backupSQLite());
const sql=connectDatabase();
try {
  const schema=process.env.DATABASE_SCHEMA||'presenca';
  console.log('PostgreSQL:',await backupPostgres(sql,schema));
  console.log('Estrutura:',await sql`SELECT column_name,data_type,column_default FROM information_schema.columns WHERE table_schema=${schema} AND table_name='attendance'`);
} finally {await sql.end();}
