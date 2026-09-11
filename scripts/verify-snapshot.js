import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connectDatabase} from '../lib/supabase-db.js';
import {validSchema} from '../lib/database.js';
process.loadEnvFile('.env');
const backup=JSON.parse(readFileSync(process.argv[2],'utf8'));
validSchema(backup.schema);
const sql=connectDatabase();
try {
  await sql.begin('isolation level repeatable read read only',async scoped=>{
    for(const [table,original] of Object.entries(backup.tables)) {
      if(['sessions','_migrations'].includes(table))continue;
      if(!/^[a-z_]+$/.test(table))throw new Error('Tabela inválida.');
      const current=await scoped.unsafe(`SELECT * FROM "${backup.schema}"."${table}"`);
      assert.equal(current.length,original.length,`Contagem mudou: ${table}`);
      const byId=new Map(current.map(row=>[row.id,row]));
      for(const row of original) {
        const saved=byId.get(row.id);assert.ok(saved,`Registro ausente em ${table}`);
        assert.ok(Object.keys(row).every(key=>JSON.stringify(row[key])===JSON.stringify(saved[key])),`Registro alterado em ${table}`);
      }
    }
  });
  console.log('Dados existentes preservados: todas as colunas anteriores conferem com o snapshot (sessões e histórico de migração excluídos).');
} catch(error) {console.error('Verificação de preservação falhou:',error.code||error.message);process.exitCode=1;}
finally {await sql.end({timeout:5});}
