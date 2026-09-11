import {publicEmail,decryptPhone} from './identifiers.js';

export function recoveryDelivery(env=process.env){
 const emailReady=!!(env.RESEND_API_KEY&&env.RESET_EMAIL_FROM);
 const smsReady=!!(env.TWILIO_ACCOUNT_SID&&env.TWILIO_AUTH_TOKEN&&env.TWILIO_FROM);
 return {
  available:emailReady||smsReady,
  async send({email,phone,link}){
   let response;
   if(email&&emailReady){
    response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.RESET_EMAIL_FROM,to:[email],subject:'Redefinir sua senha — Presença',text:'Recebemos uma solicitação para redefinir sua senha. O link vale por 30 minutos e só pode ser usado uma vez. Se não foi você, ignore esta mensagem.\n\n'+link})});
   }else if(phone&&smsReady){
    response=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(env.TWILIO_ACCOUNT_SID)+'/Messages.json',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Basic '+Buffer.from(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:'+'+phone,From:env.TWILIO_FROM,Body:'Presença: redefina sua senha em até 30 minutos: '+link})});
   }else throw new Error('RECOVERY_CHANNEL_UNAVAILABLE');
   if(!response.ok)throw new Error('RECOVERY_DELIVERY_FAILED');
  }
 };
}
export function recoveryRoutes({get,run,findUser,hash,token,now,validPassword,passwordHash,fail,throttle,identityKey,delivery,origin,log}){
 const generic={ok:true,message:'Se houver uma conta com contato de recuperação disponível, enviaremos as instruções. Confira também o spam.'};
 return async(p,method,body,ip)=>{
  if(p==='/api/recovery-options'&&method==='GET')return {data:{available:delivery.available}};
  if(p==='/api/forgot-password'&&method==='POST'){
   throttle('recover-ip:'+ip,10);
   if(!delivery.available)fail('O envio de recuperação ainda não está configurado. Tente novamente mais tarde.',503);
   const account=await findUser(body.identifier??body.email,body.identifier_type);
   if(!account)return {data:generic};
   const recent=await get('SELECT id FROM password_resets WHERE user_id=? AND expires_at>?',account.id,Date.now()+29*60_000);
   if(recent)return {data:generic};
   const email=publicEmail(account.email),phone=account.phone_encrypted?decryptPhone(account.phone_encrypted,identityKey):null;
   if(!email&&!phone)return {data:generic};
   const raw=token();
   await run('UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL',now(),account.id);
   await run('INSERT INTO password_resets(user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?)',account.id,hash(raw),Date.now()+30*60_000,now());
   const base=new URL(origin);
   if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))fail('Endereço de recuperação não configurado.',503);
   base.hash='reset/'+raw;
   return {data:generic,afterCommit:async()=>{
    try{await delivery.send({email,phone,link:base.toString()});}
    catch{console.error('RECOVERY_DELIVERY_FAILED');}
   }};
  }
  if(p==='/api/reset-password'&&method==='POST'){
   throttle('reset-ip:'+ip,15);
   validPassword(body.password);
   if(typeof body.token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(body.token))fail('Link inválido ou vencido. Solicite outro.');
   const reset=await get('SELECT r.* FROM password_resets r JOIN users u ON u.id=r.user_id WHERE r.token_hash=? AND r.used_at IS NULL AND r.expires_at>? AND u.active=1 AND u.supabase_user_id IS NULL',hash(body.token),Date.now());
   if(!reset)fail('Link inválido ou vencido. Solicite outro.');
   await run('UPDATE users SET password=? WHERE id=?',passwordHash(body.password),reset.user_id);
   await run('UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL',now(),reset.user_id);
   await run('DELETE FROM sessions WHERE user_id=?',reset.user_id);
   await log(reset.user_id,'password_reset','users',reset.user_id,null,{sessions_revoked:true});
   return {data:{ok:true}};
  }
  return null;
 };
}
