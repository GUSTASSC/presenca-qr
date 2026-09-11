export function catechistRoutes({get,all,run,log,fail,text,validEmail,validPassword,passwordHash,passwordMatches,token,hash,now,throttle,classAccess}) {
  async function ownerAccess(id,user) {
    const c=await classAccess(id,user);
    if(c.teacher_id!==user.id)fail('Somente o responsável pela turma pode gerenciar a equipe.',403);
    return c;
  }
  async function invitation(code) {
    if(!/^[A-Za-z0-9_-]{43}$/.test(code))fail('Convite inválido ou indisponível.',404);
    const invite=await get(`SELECT i.*,c.name AS class_name FROM catechist_invites i
      JOIN classes c ON c.id=i.class_id WHERE i.token_hash=? AND i.accepted_at IS NULL
      AND i.revoked_at IS NULL AND i.expires_at>? AND c.active=1`,hash(code),now());
    if(!invite)fail('Convite vencido, cancelado ou já utilizado.',404);
    return invite;
  }
  return {
    async publicRoute(p,method,body,url,ip) {
      if(p==='/api/catechist-invite'&&method==='GET') {
        throttle('team-view:'+ip,100);
        const invite=await invitation(url.searchParams.get('code')||'');
        const user=await get('SELECT id FROM users WHERE email=?',invite.email);
        return {data:{class_name:invite.class_name,email:invite.email,existing_account:!!user}};
      }
      if(p!=='/api/catechist-invite/accept'||method!=='POST')return null;
      throttle('team-accept:'+ip,20);
      const invite=await invitation(text(body.code,100));
      const email=validEmail(body.email);
      if(email!==invite.email)fail('Use o e-mail indicado neste convite.');
      if(body.confirm!==true)fail('Confirme que deseja participar da equipe.');
      const user=await get('SELECT * FROM users WHERE email=?',email);
      let uid;
      if(user) {
        throttle('team-email:'+email,10);
        if(user.role!=='teacher'||!user.active)fail('Esta conta não pode entrar na equipe de catequistas.',403);
        const candidate=typeof body.password==='string'?body.password.slice(0,128):'';
        if(!await passwordMatches(candidate,user.password,user))fail('Senha incorreta para a conta existente.',400);
        uid=user.id;
      } else {
        const name=text(body.name);
        if(name.length<3)fail('Informe seu nome completo.');
        validPassword(body.password);
        uid=Number((await run("INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,'teacher',?)",name,email,passwordHash(body.password),now())).lastInsertRowid);
      }
      await run(`INSERT INTO class_catechists(class_id,user_id,active,added_at,added_by) VALUES(?,?,1,?,?)
        ON CONFLICT(class_id,user_id) DO UPDATE SET active=1,added_at=excluded.added_at,added_by=excluded.added_by`,invite.class_id,uid,now(),invite.created_by);
      await run('UPDATE catechist_invites SET accepted_at=?,accepted_by=? WHERE id=?',now(),uid,invite.id);
      await log(uid,'join_team','classes',invite.class_id,null,{catechist_id:uid,invited_by:invite.created_by});
      return {data:{ok:true},status:201};
    },
    async privateRoute(p,method,body,user) {
      const team=p.match(/^\/api\/classes\/(\d+)\/catechists$/);
      if(team&&method==='GET') {
        const c=await classAccess(team[1],user);
        const people=await all(`SELECT u.id,u.name,u.email,u.active FROM users u
          JOIN teacher_classes t ON t.user_id=u.id WHERE t.class_id=? ORDER BY u.name`,c.id);
        const invitations=c.teacher_id===user.id?await all(`SELECT id,email,expires_at,created_at FROM catechist_invites
          WHERE class_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? ORDER BY id DESC`,c.id,now()):[];
        return {data:{class_name:c.name,owner_id:c.teacher_id,can_manage:c.teacher_id===user.id,people,invitations}};
      }
      const create=p.match(/^\/api\/classes\/(\d+)\/catechist-invites$/);
      if(create&&method==='POST') {
        const c=await ownerAccess(create[1],user);
        if(!c.active)fail('Ative a turma antes de convidar catequistas.');
        const email=validEmail(body.email);
        const existing=await get('SELECT id,role,active FROM users WHERE email=?',email);
        if(existing&&(existing.role!=='teacher'||!existing.active))fail('Este e-mail pertence a uma conta que não pode atuar como catequista.');
        if(existing&&await get('SELECT 1 FROM teacher_classes WHERE class_id=? AND user_id=?',c.id,existing.id))fail('Este catequista já participa da turma.',409);
        await run('UPDATE catechist_invites SET revoked_at=? WHERE class_id=? AND email=? AND accepted_at IS NULL AND revoked_at IS NULL',now(),c.id,email);
        const code=token(),expires=new Date(Date.now()+7*24*3600_000).toISOString();
        const id=Number((await run('INSERT INTO catechist_invites(class_id,email,token_hash,expires_at,created_at,created_by) VALUES(?,?,?,?,?,?)',c.id,email,hash(code),expires,now(),user.id)).lastInsertRowid);
        await log(user.id,'invite_catechist','classes',c.id,null,{invite_id:id,email});
        return {data:{id,code,expires_at:expires,email},status:201};
      }
      const revoke=p.match(/^\/api\/classes\/(\d+)\/catechist-invites\/(\d+)$/);
      if(revoke&&method==='DELETE') {
        const c=await ownerAccess(revoke[1],user);
        const result=await run('UPDATE catechist_invites SET revoked_at=? WHERE id=? AND class_id=? AND accepted_at IS NULL AND revoked_at IS NULL',now(),Number(revoke[2]),c.id);
        if(!result.changes)fail('Convite não encontrado.',404);
        await log(user.id,'revoke_catechist_invite','classes',c.id,null,{invite_id:Number(revoke[2])});
        return {data:{ok:true}};
      }
      const remove=p.match(/^\/api\/classes\/(\d+)\/catechists\/(\d+)$/);
      if(remove&&method==='DELETE') {
        const c=await ownerAccess(remove[1],user),uid=Number(remove[2]);
        if(uid===c.teacher_id)fail('O responsável pela turma não pode ser removido.');
        const result=await run('UPDATE class_catechists SET active=0 WHERE class_id=? AND user_id=? AND active=1',c.id,uid);
        if(!result.changes)fail('Catequista não encontrado nesta turma.',404);
        await run('UPDATE catechist_invites SET revoked_at=? WHERE class_id=? AND email=(SELECT email FROM users WHERE id=?) AND accepted_at IS NULL AND revoked_at IS NULL',now(),c.id,uid);
        await log(user.id,'remove_catechist','classes',c.id,{catechist_id:uid,active:1},{catechist_id:uid,active:0});
        return {data:{ok:true}};
      }
      return null;
    }
  };
}
