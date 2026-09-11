import assert from 'node:assert/strict';
import { createApp } from '../server.js';

let app;
const sessions=[];
try {
  app=await createApp({provider:'postgres'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}/api`;
  async function login(email) {
    const login=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Demo@2026!'})});
    assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const session={cookie,csrf:''};sessions.push(session);
    const get=async route=>{
      const response=await fetch(base+route,{headers:{Cookie:cookie}});
      assert.equal(response.status,200);
      return response.headers.get('content-type').includes('json')?response.json():response.arrayBuffer();
    };
    const me=await get('/me');session.csrf=me.csrf;
    return {get,me};
  }
  const teacher=await login('professor@demo.local');
  assert.equal(teacher.me.role,'teacher');
  assert.equal((await teacher.get('/students')).length,10);
  const classes=await teacher.get('/classes');assert.equal(classes.length,1);
  const calls=await teacher.get('/calls');assert.equal(calls.length,2);
  assert.ok(calls.every(call=>call.status==='closed'&&call.total===7));
  const report=await teacher.get(`/report?class_id=${classes[0].id}&month=2026-09`);
  assert.equal(report.rows.length,7);
  assert.ok(report.rows.every(row=>row.total===2));
  assert.equal(report.rows.reduce((n,row)=>n+row.present,0),10);
  assert.equal(report.rows.reduce((n,row)=>n+row.yes,0),6);
  const student=await login('aluno@demo.local');
  assert.equal(student.me.student.status,'approved');
  assert.equal((await student.get('/my-history')).length,2);
  const png=await student.get(`/students/${student.me.student.id}/qr`);
  assert.equal(new Uint8Array(png)[0],137);
  console.log('Demonstração no schema do aplicativo validada: login de professor/aluno, 10 alunos, turma, 2 chamadas, 14 presenças, missa, relatório, histórico e PNG.');
} catch (error) {
  console.error('Validação falhou:', error.code || 'VALIDATION_FAILED');process.exitCode=1;
} finally {
  if(app) {
    const base=`http://127.0.0.1:${app.server.address()?.port}/api`;
    for(const session of sessions) {
      if(session.csrf) {
        const response=await fetch(base+'/logout',{method:'POST',headers:{Cookie:session.cookie,'X-CSRF-Token':session.csrf}});
        if(response.status!==200)process.exitCode=1;
      }
    }
    app.server.closeAllConnections();
    await new Promise(resolve=>app.server.close(resolve));
    await app.db.close();
  }
}
