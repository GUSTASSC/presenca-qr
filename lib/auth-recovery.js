import {publicEmail,encryptPhone,decryptPhone} from './identifiers.js';

export function authRecoveryRoutes({auth,get,run,findUser,hash,token,now,validPassword,passwordHash,fail,throttle,identityKey,origin,log}){
 const generic={ok:true,message:'Se houver uma conta com e-mail cadastrado, enviaremos as instruções. Confira também o spam. Recuperação por SMS ainda não está disponível.'};
 return async(p,method,body,ip)=>{
  if(p==='/api/recovery-options'&&method==='GET')return {data:{available:auth.available,channel:'email'}};
  if(p==='/api/forgot-password'&&method==='POST'){
   throttle('recover-ip:'+ip,10);
   if(!auth.available)fail('A recuperação por e-mail está aguardando configuração do envio. Tente novamente mais tarde.',503);
   const account=await findUser(body.identifier??body.email,body.identifier_type);
   if(!account||!publicEmail(account.email))return {data:generic};
   const recent=await get('SELECT id FROM password_resets WHERE user_id=? AND expires_at>?',account.id,Date.now()+29*60_000);
   if(recent)return {data:generic};
   // Persist a cooldown shared by all server instances; never return an email token.
   await run('INSERT INTO password_resets(user_id,token_hash,expires_at,created_at,used_at) VALUES(?,?,?,?,?)',account.id,hash(token()),Date.now()+30*60_000,now(),now());
   return {data:generic,afterCommit:async()=>{try{await auth.requestRecovery(account.email,origin);}catch{console.error('SUPABASE_RECOVERY_SEND_FAILED');}}};
  }
  if(p==='/api/auth/recovery'&&method==='POST'){
   throttle('verify-recovery:'+ip,15);
   if(typeof body.token_hash!=='string'||! /^[a-f0-9]{40,128}$/i.test(body.token_hash))fail('Link inválido ou vencido. Solicite outro.');
   let proof;try{proof=await auth.verifyRecovery(body.token_hash);}catch{fail('Link inválido ou vencido. Solicite outro.');}
   const account=await findUser(proof.email,'email');
   if(!account||!proof.verifiedAt||(account.supabase_user_id&&account.supabase_user_id!==proof.id))fail('Link inválido ou conta indisponível.');
   // Commit the authority switch BEFORE attempting a remote password update.
   // A later network/DB failure must never re-enable the old local password.
   await run('UPDATE users SET supabase_user_id=?,email_verified_at=?,password=? WHERE id=?',proof.id,proof.verifiedAt,passwordHash(token()),account.id);
   await run('DELETE FROM sessions WHERE user_id=?',account.id);
   await run('UPDATE password_resets SET used_at=?,auth_session=NULL WHERE user_id=? AND used_at IS NULL',now(),account.id);
   const raw=token();
   await run('INSERT INTO password_resets(user_id,token_hash,expires_at,created_at,auth_session) VALUES(?,?,?,?,?)',account.id,hash(raw),Date.now()+15*60_000,now(),encryptPhone(JSON.stringify(proof.session),identityKey));
   await log(account.id,'email_verified','users',account.id,null,{provider:'supabase'});
   return {data:{token:raw}};
  }
  if(p==='/api/reset-password'&&method==='POST'){
   throttle('reset-ip:'+ip,15);validPassword(body.password);
   if(typeof body.token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(body.token))fail('Link inválido ou vencido. Solicite outro.');
   const reset=await get('SELECT r.*,u.supabase_user_id FROM password_resets r JOIN users u ON u.id=r.user_id WHERE r.token_hash=? AND r.used_at IS NULL AND r.expires_at>? AND u.active=1',hash(body.token),Date.now());
   if(!reset?.auth_session||!reset.supabase_user_id)fail('Link inválido ou vencido. Solicite outro.');
   try{await auth.resetPassword(JSON.parse(decryptPhone(reset.auth_session,identityKey)),body.password,reset.supabase_user_id);}catch{fail('Não foi possível salvar a senha. Tente novamente ou solicite outro link.',503);}
   await run('UPDATE password_resets SET used_at=?,auth_session=NULL WHERE user_id=? AND used_at IS NULL',now(),reset.user_id);
   await run('DELETE FROM sessions WHERE user_id=?',reset.user_id);
   await log(reset.user_id,'password_reset','users',reset.user_id,null,{provider:'supabase',sessions_revoked:true});
   return {data:{ok:true}};
  }
  return null;
 };
}
