import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { validSchema } from './database.js';

export const tables = ['users','classes','students','sessions','calls','attendance','corrections','logs','class_catechists','catechist_invites','password_resets'];
const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
export function updateEnv(values) {
  const file = new URL('../.env', import.meta.url);
  let content = readFileSync(file, 'utf8');
  for (const [key,value] of Object.entries(values)) {
    if (!/^[A-Z_]+$/.test(key) || /[\r\n"]/.test(value)) throw new Error('Configuração inválida.');
    const line = `${key}="${value}"`;
    const pattern = new RegExp(`^${key}=[^\\r\\n]*`, 'm');
    content = pattern.test(content) ? content.replace(pattern, () => line) : content + '\n' + line + '\n';
    process.env[key] = value;
  }
  writeFileSync(file, content, { mode: 0o600 });
}

export async function provisionAppRole(sql) {
  const [existing] = await sql`SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname='presenca_app'`;
  if (existing) {
    if (!process.env.DATABASE_APP_PASSWORD || !process.env.DATABASE_APP_USER) throw new Error('O papel presenca_app já existe, mas suas credenciais locais não estão configuradas.');
    if (existing.rolsuper || existing.rolcreatedb || existing.rolcreaterole || existing.rolbypassrls) throw new Error('O papel existente tem privilégios excessivos.');
    return;
  }
  const password = randomBytes(36).toString('base64url');
  // Generated base64url value, never input or printed. CREATE ROLE cannot bind
  // PASSWORD as a query parameter.
  await sql.unsafe(`CREATE ROLE presenca_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  const url = new URL(process.env.DATABASE_URL);
  const username = decodeURIComponent(url.username);
  const suffix = username.includes('.') ? username.slice(username.indexOf('.')) : '';
  updateEnv({ DATABASE_APP_USER: 'presenca_app' + suffix, DATABASE_APP_PASSWORD: password });
}

export async function migrateStructure(sql, schema = 'presenca') {
  validSchema(schema);
  const migrations = readdirSync(migrationDirectory).filter(name=>/^\d{14}_[a-z_]+\.sql$/.test(name)).sort().map(name=>{
    const source=readFileSync(new URL(name,migrationDirectory),'utf8');
    return {version:name.slice(0,14),source,checksum:createHash('sha256').update(source).digest('hex')};
  });
  return sql.begin(async scoped => {
    await scoped`SELECT pg_advisory_xact_lock(hashtextextended(${schema},0))`;
    const [existing] = await scoped`SELECT 1 FROM pg_namespace WHERE nspname=${schema}`;
    if (existing) {
      const [tracked] = await scoped`SELECT to_regclass(${schema + '._migrations'}) AS name`;
      if (!tracked.name) throw new Error('Schema já existe sem histórico desta aplicação; nenhuma estrutura foi alterada.');
      const trackedRows=await scoped.unsafe(`SELECT version,checksum FROM "${schema}"._migrations ORDER BY version`);
      for(let i=0;i<trackedRows.length;i++) {
        if(trackedRows[i].version!==migrations[i]?.version || trackedRows[i].checksum!==migrations[i].checksum) throw new Error('Histórico de migração incompatível; revisão necessária.');
      }
      if(!trackedRows.length)throw new Error('Histórico de migração vazio; revisão necessária.');
    }
    let changed=false;
    for(const {version,source,checksum} of migrations) {
      if(existing) {
        const [applied]=await scoped.unsafe(`SELECT 1 FROM "${schema}"._migrations WHERE version=$1`,[version]);
        if(applied)continue;
      }
      await scoped.unsafe(source.replace(/\bpresenca\b/g, schema)).simple();
      await scoped.unsafe(`INSERT INTO "${schema}"._migrations(version,checksum) VALUES($1,$2)`, [version,checksum]);
      changed=true;
    }
    return changed;
  });
}

export async function auditStructure(sql, schema) {
  validSchema(schema);
  const rows = await sql`SELECT c.relname,c.relrowsecurity,
    has_table_privilege('anon',c.oid,'SELECT') AS anon_read,
    has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_read,
    has_table_privilege('presenca_app',c.oid,'SELECT') AS app_read
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=${schema} AND c.relkind='r' ORDER BY c.relname`;
  if (rows.length !== tables.length+1 || rows.some(row => !row.relrowsecurity || row.anon_read || row.authenticated_read || (row.relname !== '_migrations' && !row.app_read))) {
    throw new Error('Verificação de isolamento ou RLS falhou.');
  }
  const [privileges] = await sql`SELECT has_schema_privilege('presenca_app',${schema},'CREATE') AS can_create,
    has_schema_privilege('anon',${schema},'USAGE') AS anon_usage,
    has_schema_privilege('authenticated',${schema},'USAGE') AS authenticated_usage`;
  if (privileges.can_create || privileges.anon_usage || privileges.authenticated_usage) throw new Error('Privilégios de schema excessivos.');
  return { tables: rows.length, rls: true, private: true };
}

export async function importDemo(sql, schema, source) {
  validSchema(schema);
  // Only a freshly generated in-memory SQLite fixture reaches this function.
  // Do not import live users or sessions as part of the demo migration.
  const data = {};
  for (const table of tables) data[table] = await source.all(`SELECT * FROM ${table} ORDER BY ${table === 'sessions' ? 'token_hash' : 'id'}`);
  if (data.users.length !== 11 || data.users.some(user => !user.email.endsWith('@demo.local')) || data.sessions.length) {
    throw new Error('A origem não corresponde aos dados de demonstração esperados.');
  }
  return sql.begin(async scoped => {
    await scoped`SELECT pg_advisory_xact_lock(hashtextextended(${schema},0))`;
    for (const table of tables) {
      const [row] = await scoped.unsafe(`SELECT count(*) AS n FROM "${schema}"."${table}"`);
      if (row.n) throw new Error('Destino contém dados; importação cancelada sem substituir registros.');
    }
    for (const table of tables) {
      for (const row of data[table]) {
        const keys = Object.keys(row);
        const columns = keys.map(key => `"${key}"`).join(',');
        const parameters = keys.map((_,i) => `$${i+1}`).join(',');
        await scoped.unsafe(`INSERT INTO "${schema}"."${table}" (${columns}) VALUES (${parameters})`, keys.map(key => row[key]));
      }
      if (table !== 'sessions') {
        await scoped.unsafe(`SELECT setval(pg_get_serial_sequence($1,'id'),COALESCE((SELECT max(id) FROM "${schema}"."${table}"),1),(SELECT count(*)>0 FROM "${schema}"."${table}"))`, [schema + '.' + table]);
      }
    }
    const counts = {};
    const canonical = row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key,
      value && key.endsWith('_at') ? new Date(value).toISOString() : value]));
    for (const table of tables) {
      const rows = await scoped.unsafe(`SELECT * FROM "${schema}"."${table}" ORDER BY ${table === 'sessions' ? 'token_hash' : 'id'}`);
      if (JSON.stringify(rows.map(canonical)) !== JSON.stringify(data[table].map(canonical))) throw new Error(`Divergência na importação de ${table}.`);
      counts[table] = rows.length;
    }
    return counts;
  });
}
