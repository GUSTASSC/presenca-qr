import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {testApp} from '../test-support/database.js';

test('interface: cadastro com senha simples e recuperação de aluno por link',async t=>{
 const messages=[];
 const {server,db}=await testApp(t,{delivery:{available:true,send:async message=>messages.push(message)}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const dom=new JSDOM(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),{url:base,runScripts:'outside-only'});
 const w=dom.window,$=s=>w.document.querySelector(s);let cookie='';
 t.after(()=>w.close());
 w.fetch=async(url,options={})=>{const r=await fetch(base+url,{...options,headers:{...options.headers,Cookie:cookie}});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'));
 async function until(fn){for(let i=0;i<1200;i++){if(await fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Interface não alcançou o estado esperado');}
 function submit(form){$(form).dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:$(form+' button')}));}
 await until(()=>$('#login'));
 assert.ok($('a[href="#forgot-password"]'));
 const c=await db.get('SELECT invite FROM classes WHERE id=1');
 w.location.hash='register/'+c.invite;await until(()=>$('#register'));
 assert.equal($('#register [name=email]').required,false);assert.ok($('#register [name=cpf]'));
 $('#register [name=name]').value='Aluna Recuperação';$('#register [name=email]').value='aluna-reset@example.com';
 $('#register [name=password]').value='abcdefgh';$('#register [name=terms]').checked=true;submit('#register');
 await until(()=>$('#login'));
 w.location.hash='forgot-password';await until(()=>$('#recovery-form [name=identifier]'));
 $('#recovery-form [name=identifier]').value='aluna-reset@example.com';submit('#recovery-form');
 await until(()=>messages.length===1&&$('#recovery-form').hidden);
 w.location.hash=new URL(messages[0].link).hash;await until(()=>$('#recovery-form [name=confirmation]'));
 assert.equal(w.location.hash,'#reset');assert.equal($('input[name=token]'),null);
 $('#recovery-form [name=password]').value='nova senha';$('#recovery-form [name=confirmation]').value='diferente';submit('#recovery-form');
 await until(()=>$('#recovery-form .form-error').textContent.includes('coincidem'));
 $('#recovery-form [name=confirmation]').value='nova senha';submit('#recovery-form');
 await until(()=>$('#recovery-message').textContent.includes('Senha atualizada'));
 w.location.hash='login';await until(()=>$('#login'));
 $('#login [name=email]').value='aluna-reset@example.com';$('#login [name=password]').value='nova senha';submit('#login');
 await until(()=>$('.content h1')?.textContent.includes('Aluna'));
 assert.ok(w.document.body.textContent.includes('aguardando a aprovação'));
});
