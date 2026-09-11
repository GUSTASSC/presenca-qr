import {readFileSync,copyFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
const cli=process.argv[2];if(!cli)throw Error('Informe o CLI oficial da Vercel.');
const env=parseEnv(readFileSync('.env','utf8'));
if(Buffer.from(env.IDENTITY_KEY||'','base64url').length!==32)throw Error('Chave local ausente.');
const project=JSON.parse(readFileSync('.vercel/project.json','utf8'));
if(project.projectName!=='presenca-qr')throw Error('Projeto inesperado.');
copyFileSync('.env','data/backups/account-identity-config.env');
const values={IDENTITY_KEY:env.IDENTITY_KEY,APP_ORIGIN:'https://presenca-qr.vercel.app'};
for(const key of ['RESEND_API_KEY','RESET_EMAIL_FROM','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_FROM'])if(env[key])values[key]=env[key];
for(const [key,value] of Object.entries(values)){
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[cli,'env','add',key,'production','--sensitive','--yes'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  child.stdout.resume();child.stderr.resume();child.on('error',reject);child.on('exit',resolve);child.stdin.end(value);
 });
 if(code!==0)throw Error('Não foi possível configurar '+key+'. Verifique as variáveis antes de repetir.');
 console.log('Configurada:',key);
}
