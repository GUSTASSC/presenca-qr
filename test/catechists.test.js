import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testApp} from '../test-support/database.js';
import {apiClient} from '../test-support/http.js';
import {passwordHash} from '../server.js';

test('quatro catequistas: convite, conta existente, trabalho compartilhado e revogação',async t=>{
  const {server,db}=await testApp(t);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const owner=apiClient(server),anon=apiClient(server),members=[];
  const password='EquipeTeste123!';
  await owner('/login','POST',{email:'professor@demo.local',password:'Demo@2026!'});await owner('/me');
  assert.equal((await owner('/classes/1/catechists')).people.length,1);
  await anon('/classes/1/catechists','GET',null,401);
  await db.run("INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,'teacher',?)",'Catequista existente','equipe0@example.com',passwordHash(password),new Date().toISOString());
  for(let i=0;i<3;i++) {
    const email=`equipe${i}@example.com`;
    const invite=await owner('/classes/1/catechist-invites','POST',{email},201);
    const stored=await db.get('SELECT token_hash FROM catechist_invites WHERE id=?',invite.id);
    assert.notEqual(stored.token_hash,invite.code);
    const info=await anon('/catechist-invite?code='+invite.code);
    assert.equal(info.existing_account,i===0);
    const input={email,password,name:`Catequista ${i}`,confirm:true,code:invite.code};
    if(i===0) {
      await anon('/catechist-invite/accept','POST',{...input,password:'OutraSenha123!'},400);
      await anon('/catechist-invite/accept','POST',{...input,email:'troca@example.com'},400);
    }
    await anon('/catechist-invite/accept','POST',input,201);
    await anon('/catechist-invite/accept','POST',input,404);
    const client=apiClient(server);
    await client('/login','POST',{email,password});const me=await client('/me');
    assert.equal(me.role,'teacher');
    if(i===0)assert.equal(me.name,'Catequista existente');
    assert.equal((await client('/classes')).length,1);
    assert.equal((await client('/students')).length,10);
    assert.equal((await client('/calls')).length,2);
    members.push({client,id:me.id,name:me.name});
  }
  const team=await owner('/classes/1/catechists');assert.equal(team.people.length,4);
  assert.equal(team.invitations.length,0);
  await members[0].client('/classes/1/catechist-invites','POST',{email:'outsider@example.com'},403);
  await members[0].client(`/classes/1/catechists/${members[1].id}`,'DELETE',null,403);
  await owner('/classes/1/catechists/1','DELETE',null,400);
  await owner('/classes/1/catechist-invites','POST',{email:'aluno@demo.local'},400);
  await owner('/classes/1/catechist-invites','POST',{email:'equipe0@example.com'},409);

  await members[0].client('/students/8','PATCH',{status:'approved'});
  const call=await members[0].client('/calls','POST',{class_id:1,date:'2026-09-05'},201);
  const token=(await db.get('SELECT qr_token FROM students WHERE id=1')).qr_token;
  await members[1].client(`/calls/${call.id}/scan`,'POST',{token});
  await members[2].client(`/calls/${call.id}/attendance`,'PATCH',{student_id:1,mass:'yes'});
  await owner(`/calls/${call.id}/close`,'POST',{confirm:true});
  for(const {client} of members) {
    const detail=await client(`/calls/${call.id}`);
    assert.equal(detail.rows.find(row=>row.student_id===1).mass,'yes');
    assert.equal(detail.rows.length,8);
    const report=await client('/report?class_id=1&month=2026-09');
    assert.equal(report.calls.length,3);
  }
  const logs=await owner('/logs');
  assert.ok(logs.some(log=>log.action==='scan'&&log.actor===members[1].name));
  assert.ok(logs.some(log=>log.action==='correct'&&log.actor===members[2].name));
  assert.ok((await members[0].client('/logs')).some(log=>log.action==='close'&&log.actor==='Maria Oliveira'));

  const personal=await members[0].client('/classes','POST',{name:'Turma particular do catequista'},201);
  await owner(`/classes/${personal.id}/catechists`,'GET',null,404);
  assert.ok(!(await owner('/logs')).some(log=>log.class_id===personal.id));
  await owner(`/classes/1/catechists/${members[0].id}`,'DELETE');
  assert.deepEqual((await members[0].client('/classes')).map(c=>c.id),[personal.id]);
  assert.deepEqual(await members[0].client('/students'),[]);
  await members[0].client(`/calls/${call.id}`,'GET',null,404);
  await members[0].client('/students/1/qr','GET',null,404);
  await members[0].client('/report?class_id=1&month=2026-09','GET',null,404);
  await members[0].client('/classes/1/catechists','GET',null,404);
  assert.ok((await members[0].client('/logs')).every(log=>log.class_id!==1));
  assert.ok((await owner('/logs')).some(log=>log.action==='start'&&log.actor===members[0].name));

  const revoked=await owner('/classes/1/catechist-invites','POST',{email:'revogado@example.com'},201);
  await owner(`/classes/1/catechist-invites/${revoked.id}`,'DELETE');
  await anon('/catechist-invite?code='+revoked.code,'GET',null,404);
  const expired=await owner('/classes/1/catechist-invites','POST',{email:'vencido@example.com'},201);
  await db.run('UPDATE catechist_invites SET expires_at=? WHERE id=?','2020-01-01T00:00:00Z',expired.id);
  await anon('/catechist-invite?code='+expired.code,'GET',null,404);
});
