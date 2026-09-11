import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
import path from 'node:path';

const cli=process.argv[2];
if(!cli)throw new Error('Informe o caminho do CLI oficial da Vercel.');
const env=parseEnv(readFileSync('.env','utf8'));
const project=JSON.parse(readFileSync('.vercel/project.json','utf8'));
if(project.projectName!=='presenca-qr')throw new Error('Projeto Vercel inesperado.');
const url=new URL(env.DATABASE_URL);
// Never send the administrative database credential to the hosting provider.
url.username=env.DATABASE_APP_USER;
url.password='';
const values={
 DB_PROVIDER:'postgres',DATABASE_SCHEMA:env.DATABASE_SCHEMA||'presenca',
 DATABASE_URL:url.toString(),DATABASE_APP_USER:env.DATABASE_APP_USER,
 DATABASE_APP_PASSWORD:env.DATABASE_APP_PASSWORD,
 DATABASE_SSL_CA:env.DATABASE_SSL_CA||readFileSync(path.resolve(env.DATABASE_SSL_CA_PATH),'utf8'),
 COOKIE_SECURE:'true',NODEJS_HELPERS:'0',
};
if(Object.values(values).some(value=>!value))throw new Error('Configuração local incompleta.');
for(const [key,value] of Object.entries(values)){
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[cli,'env','add',key,'production','--yes','--sensitive'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  // CLI output is deliberately suppressed so that no submitted value is logged.
  child.stdout.resume();child.stderr.resume();child.on('error',reject);child.on('exit',resolve);
  child.stdin.end(value);
 });
 if(code!==0)throw new Error('Não foi possível configurar '+key+'. Consulte vercel env ls antes de repetir.');
 console.log('Configurada:',key);
}
