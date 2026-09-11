import { createApp } from '../server.js';
import { connectDatabase } from '../lib/supabase-db.js';
import { provisionAppRole, migrateStructure, auditStructure, importDemo } from '../lib/postgres-migration.js';
import { backupSQLite } from './backup-sqlite.js';
import { backupPostgres } from './backup-postgres.js';

let sql, fixture;
try {
  console.log('Backup verificado:', await backupSQLite());
  sql = connectDatabase();
  await provisionAppRole(sql);
  const schema = process.env.DATABASE_SCHEMA || 'presenca';
  console.log('Snapshot PostgreSQL:',await backupPostgres(sql,schema) || 'Schema ainda não existe.');
  const created = await migrateStructure(sql, schema);
  console.log(created ? 'Estrutura criada.' : 'Estrutura já aplicada; checksum confirmado.');
  console.log('Isolamento verificado:', await auditStructure(sql, schema));
  if (process.argv.includes('--demo')) {
    fixture = await createApp({provider:'sqlite', dbPath:':memory:', seed:true});
    const counts = await importDemo(sql,schema,fixture.db);
    console.log('Demonstração importada e comparada registro a registro:', counts);
  }
  console.log('SQLite original preservado. DB_PROVIDER não foi alterado.');
} catch (error) {
  console.error('Migração interrompida:', error.code ? String(error.code).replace(/[^A-Z0-9_]/g,'') : error.message);
  process.exitCode = 1;
} finally {
  if (fixture) await fixture.db.close();
  if (sql) await sql.end({ timeout: 5 });
}
