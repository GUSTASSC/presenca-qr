import {mkdirSync,writeFileSync} from 'node:fs';
import {validSchema} from '../lib/database.js';

export async function backupPostgres(sql,schema) {
  validSchema(schema);
  const data=await sql.begin('isolation level repeatable read read only',async scoped=>{
    const relations=await scoped`SELECT tablename FROM pg_tables WHERE schemaname=${schema} ORDER BY tablename`;
    if(!relations.length)return null;
    const rows={};
    for(const {tablename} of relations) {
      if(!/^[a-z_]+$/.test(tablename))throw new Error('Nome de tabela inesperado no backup.');
      rows[tablename]=Array.from(await scoped.unsafe(`SELECT * FROM "${schema}"."${tablename}"`));
    }
    return {schema,created_at:new Date().toISOString(),tables:rows};
  });
  if(!data)return null;
  mkdirSync('data/backups',{recursive:true});
  const filename=`data/backups/${schema}-${new Date().toISOString().replaceAll(':','-')}.json`;
  writeFileSync(filename,JSON.stringify(data,null,2),{mode:0o600});
  return filename;
}
