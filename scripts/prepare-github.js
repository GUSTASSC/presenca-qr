import {readFileSync,writeFileSync,readdirSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
process.loadEnvFile('.env');
const roots=['.gitignore','.env.example','package.json','package-lock.json','README.md','SUPABASE.md','RETOMAR.md','server.js'];
const directories=['lib','public','scripts','supabase/migrations','test','test-support'];
const files=[...roots];
for(const directory of directories) {
  for(const entry of readdirSync(directory,{withFileTypes:true})) {
    if(entry.isFile()&&/\.(js|sql|html|css)$/.test(entry.name))files.push(directory+'/'+entry.name);
  }
}
const sensitive=['DATABASE_PASSWORD','DATABASE_APP_PASSWORD','ADMIN_PASSWORD','GH_TOKEN','GITHUB_TOKEN']
  .map(key=>process.env[key]).filter(value=>value&&value.length>=6);
const entries=files.sort().map(file=>{
  const content=readFileSync(file,'utf8');
  if(sensitive.some(value=>content.includes(value))||/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content))throw new Error(`Conteúdo privado detectado: ${file}`);
  return {path:file,content,sha256:createHash('sha256').update(content).digest('hex')};
});
if(process.argv[2]==='--file') {
  const entry=entries.find(entry=>entry.path===process.argv[3]);
  if(!entry)throw new Error('Arquivo fora da lista de publicação.');
  console.log(JSON.stringify(entry));
} else {
  const stage='data/backups/github-ready-'+new Date().toISOString().replaceAll(':','-');
  mkdirSync(stage,{recursive:true});
  for(const entry of entries){const target=path.join(stage,entry.path);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(entry.path,target);}
  writeFileSync('data/backups/github-upload-manifest.json',JSON.stringify({stage,files:entries.map(({path,sha256})=>({path,sha256}))},null,2));
  console.log(JSON.stringify({stage,count:entries.length,files:entries.map(entry=>entry.path)}));
}
