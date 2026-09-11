import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
process.loadEnvFile('.env');
const cli=process.argv[2];
if(!cli)throw new Error('Informe o caminho da CLI Supabase instalada.');
const url=new URL(process.env.DATABASE_URL);
url.password=process.env.DATABASE_PASSWORD;
url.searchParams.set('sslmode','verify-full');
url.searchParams.set('sslrootcert',path.resolve(process.env.DATABASE_SSL_CA_PATH).replaceAll('\\','/'));
const result=spawnSync(cli,['db','advisors','--db-url',url.toString(),'--type','all','--fail-on','error','--output-format','json'],{encoding:'utf8',timeout:60000,windowsHide:true});
// Never print CLI stderr or arguments: some connection errors include the URI.
if(result.status!==0){console.error('Advisors não concluído. Código:',result.status??'TIMEOUT');process.exitCode=1;}
else {
  try {
    const report=JSON.parse(result.stdout);
    mkdirSync('data/backups',{recursive:true});
    writeFileSync('data/backups/postgres-advisors.json',JSON.stringify(report,null,2));
    console.log('Advisors concluído. Relatório salvo em data/backups/postgres-advisors.json.');
  } catch {console.error('Formato inesperado no relatório de advisors.');process.exitCode=1;}
}
