import '../server.js';
import {connectDatabase} from '../lib/supabase-db.js';
import {validSchema} from '../lib/database.js';
import {normalizePhone,identifierHash,encryptPhone} from '../lib/identifiers.js';

const schema=validSchema(process.env.DATABASE_SCHEMA||'presenca');
const sql=connectDatabase();
try{
 const count=await sql.begin(async scoped=>{
  await scoped`SELECT pg_advisory_xact_lock(hashtextextended(${schema},0))`;
  const columns=await scoped`SELECT column_name FROM information_schema.columns WHERE table_schema=${schema} AND table_name='users' AND column_name='phone_hash'`;
  const rows=await scoped.unsafe(`SELECT u.id,s.phone,${columns.length?'u.phone_hash':'NULL AS phone_hash'} FROM "${schema}".users u JOIN "${schema}".students s ON s.user_id=u.id WHERE s.phone IS NOT NULL AND s.phone<>''`);
  const seen=new Map(),updates=[],invalid=[];
  for(const row of rows){
   let normalized;try{normalized=normalizePhone(row.phone);}catch{invalid.push(row.id);continue;}
   const hash=identifierHash('phone',normalized,process.env.IDENTITY_KEY);
   if(seen.has(hash)&&seen.get(hash)!==row.id)throw new Error('Telefones antigos duplicados; confira usuários '+seen.get(hash)+' e '+row.id+'. Nenhum dado foi alterado.');
   seen.set(hash,row.id);
   if(row.phone_hash&&row.phone_hash!==hash)throw new Error('Identificador existente divergente; revisão necessária.');
   if(!row.phone_hash)updates.push({id:row.id,hash,encrypted:encryptPhone(normalized,process.env.IDENTITY_KEY)});
  }
  if(invalid.length)console.log('Telefones antigos preservados sem habilitar login por telefone; usuários:',invalid.join(', '));
  if(process.argv.includes('--check'))return updates.length;
  for(const row of updates)await scoped.unsafe(`UPDATE "${schema}".users SET phone_hash=$1,phone_encrypted=$2 WHERE id=$3 AND phone_hash IS NULL`,[row.hash,row.encrypted,row.id]);
  return updates.length;
 });
 console.log(process.argv.includes('--check')?'Identificadores a complementar:':'Identificadores complementados:',count);
}catch(error){console.error(error.code||error.message);process.exitCode=1;}finally{await sql.end({timeout:5});}
