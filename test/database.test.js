import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from '../test-support/database.js';
import { createApp } from '../server.js';

test('transações, concorrência, lista congelada, CSV e permissões do banco', async t => {
  const {server,db} = await testApp(t);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let secondServer = server;
  if (db.provider === 'postgres') {
    // Exercise a second Node application/pool: an in-process mutex alone would
    // not protect two deployed instances from duplicate scans or call creation.
    const second = await createApp({provider:'postgres',schema:db.schema});
    secondServer = second.server;
    await new Promise(resolve => secondServer.listen(0,'127.0.0.1',resolve));
    t.after(async () => {
      secondServer.closeAllConnections();
      await new Promise(resolve => secondServer.close(resolve));
      await second.db.close();
    });
    await assert.rejects(db.run('DELETE FROM students WHERE id=?',1), {code:'42501'});
    await assert.rejects(db.run('CREATE TABLE forbidden(id integer)'), {code:'42501'});
  }
  const initial = (await db.get('SELECT count(*) AS n FROM logs')).n;
  await assert.rejects(db.tx(async () => {
    await db.run('INSERT INTO logs(action,entity,created_at) VALUES(?,?,?)','rollback_test','test',new Date().toISOString());
    throw new Error('Rollback intencional');
  }), /Rollback intencional/);
  assert.equal((await db.get('SELECT count(*) AS n FROM logs')).n,initial);
  await assert.rejects(db.run('INSERT INTO attendance(call_id,student_id) VALUES(?,?)',1,8));
  assert.equal((await db.get('SELECT count(*) AS n FROM attendance')).n,14);

  async function client(target) {
    const base = `http://127.0.0.1:${target.address().port}/api`;
    const login = await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'professor@demo.local',password:'Demo@2026!'})});
    assert.equal(login.status,200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const me = await (await fetch(base+'/me',{headers:{Cookie:cookie}})).json();
    return async (path, method='GET',body,csrf=me.csrf) => {
      const response = await fetch(base+path,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
      return {status:response.status,data:response.headers.get('content-type').includes('json')?await response.json():await response.text()};
    };
  }
  const a = await client(server), b = await client(secondServer);
  assert.equal((await a('/classes','POST',{name:'Sem CSRF'},'')).status,403);
  const created = await Promise.all([a('/calls','POST',{class_id:1,date:'2026-09-05'}),b('/calls','POST',{class_id:1,date:'2026-09-05'})]);
  assert.deepEqual(created.map(r=>r.status).sort(),[200,201]);
  assert.equal(created[0].data.id,created[1].data.id);
  const call = created[0].data.id;
  const token1 = (await db.get('SELECT qr_token FROM students WHERE id=1')).qr_token;
  const scanned = await Promise.all([a(`/calls/${call}/scan`,'POST',{token:token1}),b(`/calls/${call}/scan`,'POST',{token:token1})]);
  assert.deepEqual(scanned.map(r=>r.status).sort(),[200,409]);
  const before = await db.get('SELECT * FROM attendance WHERE call_id=? AND student_id=1',call);
  assert.ok(before.scanned_at);
  assert.equal((await db.get("SELECT count(*) AS n FROM logs WHERE action='scan' AND record_id=?",before.id)).n,1);

  const failedBatch = await a(`/calls/${call}/attendance`,'PATCH',{student_ids:[2,99999],presence:'present',mass:'yes'});
  assert.equal(failedBatch.status,400);
  const unchanged = await db.get('SELECT * FROM attendance WHERE call_id=? AND student_id=2',call);
  assert.equal(unchanged.presence,'unregistered');
  assert.equal(unchanged.mass,'unknown');
  assert.equal((await db.get("SELECT count(*) AS n FROM logs WHERE action='correct' AND record_id=?",unchanged.id)).n,0);
  assert.equal((await a('/students/8','PATCH',{status:'approved'})).status,200);
  const lateToken = (await db.get('SELECT qr_token FROM students WHERE id=8')).qr_token;
  assert.equal((await a(`/calls/${call}/scan`,'POST',{token:lateToken})).status,400);
  assert.equal((await a(`/calls/${call}`)).data.rows.length,7);

  const token2 = (await db.get('SELECT qr_token FROM students WHERE id=2')).qr_token;
  const raced = await Promise.all([a(`/calls/${call}/close`,'POST',{confirm:true}),b(`/calls/${call}/scan`,'POST',{token:token2})]);
  assert.equal(raced[0].status,200);
  assert.ok([200,400].includes(raced[1].status));
  const finalCall = (await a(`/calls/${call}`)).data;
  assert.equal(finalCall.status,'closed');
  assert.ok(finalCall.rows.every(row=>row.presence!=='unregistered'));
  assert.equal(finalCall.rows.find(row=>row.student_id===2).presence,raced[1].status===200?'present':'absent');
  assert.equal((await a(`/calls/${call}/attendance`,'PATCH',{student_id:1,presence:'absent',mass:'no'})).status,200);
  assert.equal((await db.get('SELECT scanned_at FROM attendance WHERE id=?',before.id)).scanned_at,before.scanned_at);
  const csv = await a('/report.csv?class_id=1&month=2026-09');
  assert.equal(csv.status,200);
  assert.ok(csv.data.includes('2026-09-01') && csv.data.includes('2026-09-05'));
  assert.ok(csv.data.includes('Ausente / Missa: Não'));
  const history = await a('/calls');
  assert.equal(history.status,200);
  assert.equal(history.data.find(row=>row.id===call).total,7);
});
