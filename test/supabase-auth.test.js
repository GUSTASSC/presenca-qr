import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testApp} from '../test-support/database.js';
import {apiClient} from '../test-support/http.js';
import {passwordHash} from '../server.js';

test('Supabase: migração gradual, contato verificado, reset único, falhas e logout',async t=>{
 let consumed=false,password='remote-original',failReset=false,offline=false;const sent=[];
 const authProvider={available:true,
  requestRecovery:async email=>sent.push(email),
  verifyRecovery:async proof=>{if(consumed||proof!=='a'.repeat(64))throw Error('expired');consumed=true;return {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'aluno@demo.local',verifiedAt:new Date().toISOString(),session:{access_token:'private-access-token',refresh_token:'private-refresh-token'}};},
  resetPassword:async(session,next,id)=>{assert.equal(session.access_token,'private-access-token');assert.match(id,/^aaaa/);if(failReset)throw Error('network');password=next;},
  login:async(email,pw,id)=>{if(offline)throw Error('offline');return pw===password&&email==='aluno@demo.local'&&id.startsWith('aaaa');}
 };
 const {server,db}=await testApp(t,{authProvider});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 function client(){let cookie='',csrf='';return async(route,method='GET',body,status=200)=>{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',cookie,'X-CSRF-Token':csrf},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];if(data.csrf)csrf=data.csrf;return data;};}
 const student=client(),anon=client();
 await student('/login','POST',{email:'aluno@demo.local',password:'Demo@2026!'});const me=await student('/me');
 const before=await db.get('SELECT * FROM users WHERE id=?',me.id);
 const message=await anon('/forgot-password','POST',{identifier:'aluno@demo.local'});assert.equal(sent.length,1);
 assert.deepEqual(await anon('/forgot-password','POST',{identifier:'missing@example.com'}),message);
 await anon('/forgot-password','POST',{identifier:'aluno@demo.local'});assert.equal(sent.length,1);
 assert.equal((await db.get('SELECT password FROM users WHERE id=?',me.id)).password,before.password);
 await anon('/auth/recovery','POST',{token_hash:'b'.repeat(64)},400);
 const proof=await anon('/auth/recovery','POST',{token_hash:'a'.repeat(64)});
 await student('/me','GET',undefined,401);
 const linked=await db.get('SELECT * FROM users WHERE id=?',me.id);assert.ok(linked.email_verified_at);assert.notEqual(linked.password,before.password);
 const stored=JSON.stringify(await db.all('SELECT * FROM password_resets'));assert.ok(!stored.includes('private-access-token'));assert.ok(!stored.includes(proof.token));
 await anon('/auth/recovery','POST',{token_hash:'a'.repeat(64)},400);
 await anon('/login','POST',{email:'aluno@demo.local',password:'Demo@2026!'},401);
 failReset=true;await anon('/reset-password','POST',{token:proof.token,password:'simple new password'},503);
 await anon('/login','POST',{email:'aluno@demo.local',password:'Demo@2026!'},401);
 failReset=false;await anon('/reset-password','POST',{token:proof.token,password:'simple new password'});
 await anon('/reset-password','POST',{token:proof.token,password:'another password'},400);
 offline=true;await anon('/login','POST',{email:'aluno@demo.local',password:'simple new password'},503);offline=false;
 await student('/login','POST',{email:'aluno@demo.local',password:'simple new password'});await student('/me');await student('/logout','POST',{});await student('/me','GET',undefined,401);
 const teacher=client();await teacher('/login','POST',{email:'professor@demo.local',password:'Demo@2026!'});await teacher('/me');
 const [{invite}]=await teacher('/classes');
 await anon('/register','POST',{name:'Telefone Apenas',phone:'(31) 98888-4321',password:'abcdefgh',invite,terms:true},201);
 await anon('/login','POST',{identifier:'31988884321',password:'abcdefgh'});
 await anon('/forgot-password','POST',{identifier:'31988884321'});assert.equal(sent.length,1);
 assert.equal((await db.get('SELECT count(*) AS n FROM users')).n,12);
});

test('catequista migrado aceita convite usando a senha do Supabase',async t=>{
 const email='migrado@example.com';
 const {server,db}=await testApp(t,{authProvider:{available:false,login:async(e,p,id)=>e===email&&p==='remote password'&&id==='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 await db.run("INSERT INTO users(name,email,password,role,created_at,supabase_user_id,email_verified_at) VALUES(?,?,?,'teacher',?,?,?)",'Catequista Migrado',email,passwordHash('old password'),new Date().toISOString(),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',new Date().toISOString());
 const owner=apiClient(server),anon=apiClient(server);
 await owner('/login','POST',{email:'professor@demo.local',password:'Demo@2026!'});await owner('/me');
 const invite=await owner('/classes/1/catechist-invites','POST',{email},201);
 const body={email,code:invite.code,confirm:true};
 await anon('/catechist-invite/accept','POST',{...body,password:'old password'},400);
 await anon('/catechist-invite/accept','POST',{...body,password:'remote password'},201);
 await anon('/login','POST',{email,password:'remote password'});await anon('/me');
 assert.equal((await anon('/classes')).length,1);
});
