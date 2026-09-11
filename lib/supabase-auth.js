import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';

// Server only. Each operation owns its client; sessions never cross requests.
export function supabaseAuth(env=process.env){
 if(env.SUPABASE_AUTH_ENABLED!=='true')return null;
 const {SUPABASE_URL:url,SUPABASE_ANON_KEY:key,SUPABASE_SERVICE_ROLE_KEY:secret}=env;
 if(!url||!key||!secret)throw Error('SUPABASE_AUTH_CONFIG_MISSING');
 if(new URL(url).protocol!=='https:')throw Error('SUPABASE_AUTH_HTTPS_REQUIRED');
 const client=(admin=false)=>createClient(url,admin?secret:key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(8000)})}});
 const check=({data,error})=>{if(error)throw Object.assign(Error('AUTH_REQUEST_FAILED'),{code:error.code,status:error.status});return data;};
 return {
  available:env.SUPABASE_RECOVERY_ENABLED==='true',
  async requestRecovery(email,origin){
   const created=await client(true).auth.admin.createUser({email,password:randomBytes(48).toString('base64url'),email_confirm:false});
   if(created.error&&!['email_exists','email_address_exists'].includes(created.error.code))check(created);
   check(await client().auth.resetPasswordForEmail(email,{redirectTo:origin}));
  },
  async verifyRecovery(token_hash){
   const c=client();
   const {user,session}=check(await c.auth.verifyOtp({token_hash,type:'recovery'}));
   if(!user?.email_confirmed_at||!session)throw Error('AUTH_UNVERIFIED_EMAIL');
   return {id:user.id,email:user.email,verifiedAt:user.email_confirmed_at,session:{access_token:session.access_token,refresh_token:session.refresh_token}};
  },
  async resetPassword(session,password,expectedId){
   const c=client();check(await c.auth.setSession(session));
   const {user}=check(await c.auth.getUser());
   if(user.id!==expectedId)throw Error('AUTH_ID_MISMATCH');
   check(await c.auth.updateUser({password}));
   check(await c.auth.signOut({scope:'global'}));
  },
  async login(email,password,expectedId){
   const c=client();
   const result=await c.auth.signInWithPassword({email,password});
   if(result.error){if(['invalid_credentials','email_not_confirmed','user_banned'].includes(result.error.code))return false;check(result);}
   const ok=result.data.user?.id===expectedId&&!!result.data.user.email_confirmed_at;
   // Supabase proves the password; the app keeps only its own HttpOnly session.
   check(await c.auth.signOut({scope:'local'}));
   return ok;
  }
 };
}
