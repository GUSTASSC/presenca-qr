// Isolated local application + newly created Auth fixture. Never deletes existing users.
import {createApp} from '../server.js';
import {supabaseAuth} from '../lib/supabase-auth.js';
import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const auth=supabaseAuth({...process.env,SUPABASE_AUTH_ENABLED:'true',SUPABASE_RECOVERY_ENABLED:'false'});
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const email=`presenca-test-${randomBytes(12).toString('hex')}@example.com`;
let createdId,app;
try{
 const created=await admin.auth.admin.createUser({email,password:randomBytes(32).toString('hex'),email_confirm:false});
 if(created.error)throw Error('TEST_CREATE_FAILED_'+created.error.code);createdId=created.data.user.id;
 app=await createApp({provider:'sqlite',dbPath:':memory:',seed:true,authProvider:auth});
 await app.db.run('UPDATE users SET email=? WHERE id=2',email);
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${app.server.address().port}/api`;
 let cookie='',csrf='';
 const request=async(path,body,status=200,method='POST')=>{const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',cookie,'X-CSRF-Token':csrf},...(body?{body:JSON.stringify(body)}:{})});const data=await res.json();assert.equal(res.status,status,JSON.stringify(data));if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];if(data.csrf)csrf=data.csrf;return data;};
 await request('/login',{email,password:'Demo@2026!'});await request('/me',null,200,'GET');
 // Generate an authentic recovery proof without sending email to any recipient.
 const link=await admin.auth.admin.generateLink({type:'recovery',email});if(link.error)throw Error('TEST_LINK_FAILED_'+link.error.code);
 const {token}=await request('/auth/recovery',{token_hash:link.data.properties.hashed_token});
 await request('/me',null,401,'GET');
 const password='simple '+randomBytes(12).toString('hex');
 await request('/reset-password',{token,password});
 await request('/reset-password',{token,password},400);
 await request('/login',{email,password:'Demo@2026!'},401);
 await request('/login',{email,password});await request('/me',null,200,'GET');
 await request('/logout',{});await request('/me',null,401,'GET');
 console.log('PASS: Auth real, prova recovery, redefinição, senha antiga rejeitada, login e logout. Entrega de e-mail não testada (SMTP ausente).');
}finally{
 if(app){app.server.closeAllConnections();await new Promise(r=>app.server.close(r));await app.db.close();}
 if(createdId){const result=await admin.auth.admin.deleteUser(createdId);if(result.error)throw Error('TEST_CLEANUP_FAILED');console.log('Conta temporária de teste removida; usuários existentes preservados.');}
}
