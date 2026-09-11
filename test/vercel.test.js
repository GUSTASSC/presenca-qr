import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createApp} from '../server.js';
import {clientAddress} from '../lib/client-address.js';

test('Vercel: endereço do cliente só confia no proxy dentro da plataforma',()=>{
 const req={headers:{'x-forwarded-for':'203.0.113.10'},socket:{remoteAddress:'127.0.0.1'}};
 assert.equal(clientAddress(req,{}),'127.0.0.1');
 assert.equal(clientAddress(req,{VERCEL:'1'}),'203.0.113.10');
 req.headers['x-forwarded-for']='203.0.113.10, 198.51.100.2';
 assert.equal(clientAddress(req,{VERCEL:'1'}),'127.0.0.1');
 req.headers['x-vercel-forwarded-for']='2001:db8::1';
 assert.equal(clientAddress(req,{VERCEL:'1'}),'2001:db8::1');
});

test('Vercel: handler reutilizado mantém rotas, JSON, sessão, CSRF e arquivos privados',async t=>{
 const app=await createApp({provider:'sqlite',dbPath:':memory:',seed:true});
 const server=createServer(app.handler);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await app.db.close();});
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const route of ['/','/app.js','/style.css','/vendor/zxing.js']){
  const res=await fetch(base+route);assert.equal(res.status,200,route);
  assert.ok(res.headers.get('content-security-policy'));await res.arrayBuffer();
 }
 for(const route of ['/.env','/server.js','/supabase-ca.crt','/data/presenca.sqlite'])assert.equal((await fetch(base+route)).status,404);
 assert.equal((await fetch(base+'/api/me')).status,401);
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'professor@demo.local',password:'Demo@2026!'})});
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const me=await (await fetch(base+'/api/me',{headers:{Cookie:cookie}})).json();assert.equal(me.role,'teacher');
 assert.equal((await fetch(base+'/api/logout',{method:'POST',headers:{Cookie:cookie}})).status,403);
 assert.equal((await fetch(base+'/api/logout',{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':me.csrf}})).status,200);
});
