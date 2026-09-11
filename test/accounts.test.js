import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testApp} from '../test-support/database.js';
import {normalizeCPF,normalizePhone,identifierHash,decryptPhone} from '../lib/identifiers.js';

test('identificadores: CPF válido, telefone normalizado e chave secreta',()=>{
 assert.equal(normalizeCPF('529.982.247-25'),'52998224725');
 for(const value of ['11111111111','52998224724','abc52998224725',''])assert.throws(()=>normalizeCPF(value));
 assert.equal(normalizePhone('(11) 98765-4321'),normalizePhone('+55 11 98765-4321'));
 assert.throws(()=>normalizePhone('123'));assert.throws(()=>identifierHash('cpf','52998224725',undefined));
});

test('contas: cadastro por três identificadores, duplicidade, código e recuperação de aluno',async t=>{
 const messages=[];
 const {server,db}=await testApp(t,{delivery:{available:true,send:async message=>messages.push(message)}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 function client(){let cookie='',csrf='';return async(route,method='GET',body,status=200)=>{
  const res=await fetch(base+route,{method,headers:{'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json();assert.equal(res.status,status,JSON.stringify(data));
  if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];if(data.csrf)csrf=data.csrf;return data;
 };}
 const teacher=client(),anon=client();
 await teacher('/login','POST',{email:'professor@demo.local',password:'Demo@2026!'});await teacher('/me');
 const classes=await teacher('/classes'),invite=classes[0].invite;
 const identifiers=[{email:'conta-email@example.com'},{phone:'(21) 98888-1234'},{cpf:'529.982.247-25',email:'conta-cpf@example.com'}];
 const students=[];
 for(let i=0;i<identifiers.length;i++){
  const body={name:'Novo Aluno '+i,invite,terms:true,password:'abcdefgh',...identifiers[i]};
  await anon('/register','POST',body,201);
  const student=client();const identifier=Object.values(identifiers[i])[0];
  await student('/login','POST',{identifier,password:'abcdefgh'});const me=await student('/me');
  assert.equal(me.student.status,'pending');assert.match(me.student.student_code,/^[A-F0-9]{10}$/);
  assert.equal(me.student.qr_token,undefined);assert.equal(me.password,undefined);
  const raw=await db.get('SELECT * FROM users WHERE id=?',me.id);assert.notEqual(raw.password,'abcdefgh');
  assert.ok(!JSON.stringify(me).includes('52998224725'));
  if(i===1){assert.notEqual(raw.phone_encrypted,'5521988881234');assert.equal(decryptPhone(raw.phone_encrypted,process.env.IDENTITY_KEY),'5521988881234');assert.equal(me.email,null);assert.equal(me.student.phone,'•••• 1234');assert.equal(me.student.phone_encrypted,undefined);}
  if(i===2){assert.equal(raw.cpf_hash.length,64);assert.equal(me.email,'conta-cpf@example.com');}
  students.push({me,student,identifier});
  await anon('/register','POST',body,400);
 }
 await anon('/register','POST',{name:'Outro Aluno',invite,terms:true,password:'abcdefgh',phone:'+55 21 98888-1234'},400);
 await anon('/register','POST',{name:'Outro Aluno',invite,terms:true,password:'abcdefgh',cpf:'52998224725',email:'outro-cpf@example.com'},400);
 const cpfOnly=await anon('/register','POST',{name:'Sem Contato',invite,terms:true,password:'abcdefgh',cpf:'11144477735'},400);
 assert.match(cpfOnly.error,/e-mail ou telefone/);
 assert.equal(await db.get('SELECT id FROM users WHERE cpf_hash=?',identifierHash('cpf','11144477735',process.env.IDENTITY_KEY)),undefined);
 await anon('/register','POST',{name:'Outro Aluno',invite,terms:true,password:'abcdefgh',cpf:'11111111111'},400);
 await anon('/register','POST',{name:'Outro Aluno',invite,terms:true,password:'1234567',email:'short@example.com'},400);
 await anon('/register','POST',{name:'Outro Aluno',invite,terms:true,password:'abcdefgh'},400);
 for(const {me} of students)await teacher('/students/'+me.student.id,'PATCH',{status:'approved'});
 const call=await teacher('/calls','POST',{class_id:classes[0].id,date:'2026-09-05'},201);
 const a=students[0],code=a.me.student.student_code;
 const first=await teacher('/calls/'+call.id+'/scan','POST',{code:code.toLowerCase()});assert.equal(first.student_id,a.me.student.id);
 await teacher('/calls/'+call.id+'/attendance','PATCH',{student_id:first.student_id,mass:'yes'});
 await teacher('/calls/'+call.id+'/scan','POST',{code},409);
 const qr=(await db.get('SELECT qr_token FROM students WHERE id=?',first.student_id)).qr_token;
 await teacher('/calls/'+call.id+'/scan','POST',{token:qr},409);
 await a.student('/calls/'+call.id+'/scan','POST',{code},403);
 const generic=await anon('/forgot-password','POST',{identifier:a.identifier});
 assert.equal(messages.length,1);assert.equal(messages[0].email,a.identifier);
 assert.deepEqual(await anon('/forgot-password','POST',{identifier:'missing@example.com'}),generic);
 const resetToken=new URL(messages[0].link).hash.slice(7);
 assert.equal(generic.token,undefined);assert.ok(!JSON.stringify(await db.all('SELECT * FROM password_resets')).includes(resetToken));
 await anon('/reset-password','POST',{token:resetToken,password:'nova senha'},200);
 await a.student('/me','GET',undefined,401);
 await anon('/login','POST',{identifier:a.identifier,password:'abcdefgh'},401);
 await anon('/login','POST',{identifier:a.identifier,password:'nova senha'});
 await anon('/reset-password','POST',{token:resetToken,password:'outrasenha'},400);
 await anon('/forgot-password','POST',{identifier:students[1].identifier});assert.equal(messages.length,2);assert.equal(messages[1].phone,'5521988881234');
 const expired=new URL(messages[1].link).hash.slice(7);
 await db.run('UPDATE password_resets SET expires_at=? WHERE user_id=?',Date.now()-1,students[1].me.id);
 await anon('/reset-password','POST',{token:expired,password:'abcdefgh'},400);
 await teacher('/calls/'+call.id+'/close','POST',{confirm:true});
 await teacher('/calls/'+call.id+'/scan','POST',{code:students[2].me.student.student_code},400);
});
