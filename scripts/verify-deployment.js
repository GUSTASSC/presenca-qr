import assert from 'node:assert/strict';

const base=new URL(process.argv[2]);
if(base.protocol!=='https:'||!base.hostname.endsWith('.vercel.app'))throw new Error('Informe o endereço HTTPS da publicação Vercel.');
for(const route of ['/','/app.js','/style.css','/vendor/zxing.js']){
 const response=await fetch(new URL(route,base));
 assert.equal(response.status,200,route);
 assert.ok(response.headers.get('content-security-policy'),route);
 const body=await response.text();
 if(route==='/app.js'){assert.ok(body.includes('async function saveScanMass'));assert.ok(body.includes('student-code-form'));assert.ok(body.includes('Esqueci minha senha'));assert.ok(body.includes('function setMenu'));}
 console.log('OK:',route);
}
for(const route of ['/.env','/server.js','/supabase-ca.crt','/data/presenca.sqlite'])assert.equal((await fetch(new URL(route,base))).status,404,route);
console.log('OK: arquivos privados não são servidos.');
for(const email of ['professor@demo.local','aluno@demo.local']){
 let cookie,csrf;
 async function request(route,method='GET',body){
  const response=await fetch(new URL('/api'+route,base),{method,headers:{'Content-Type':'application/json',Origin:base.origin,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200,route);
  return response;
 }
 try{
  const response=await request('/login','POST',{email,password:'Demo@2026!'});
  const header=response.headers.get('set-cookie');
  assert.match(header,/;\s*Secure/i);assert.match(header,/HttpOnly/i);
  cookie=header.split(';')[0];
  const me=await (await request('/me')).json();csrf=me.csrf;
  if(me.role==='teacher'){
   await request('/classes');const students=await (await request('/students')).json();
   for(const student of students){assert.match(student.student_code,/^[A-F0-9]{10}$/);assert.equal(student.qr_token,undefined);assert.equal(student.phone_encrypted,undefined);assert.equal(student.cpf_hash,undefined);if(student.phone)assert.match(student.phone,/^•••• \d{4}$/);}
   const calls=await (await request('/calls')).json();
   if(calls.length){await request('/calls/'+calls[0].id);await request('/report?class_id='+calls[0].class_id+'&month='+calls[0].date.slice(0,7));}
  }else{
   assert.equal(me.student.qr_token,undefined);assert.match(me.student.student_code,/^[A-F0-9]{10}$/);
   const png=await (await request('/students/'+me.student.id+'/qr')).arrayBuffer();
   assert.equal(new Uint8Array(png)[0],137);await request('/my-history');
  }
  console.log('OK: login, sessão HTTPS e consultas de',me.role);
 }finally{if(cookie&&csrf)await request('/logout','POST');}
}
console.log('Publicação verificada sem alterar turmas, alunos ou chamadas.');
