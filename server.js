import http from 'node:http';
import {normalizeCPF,normalizePhone,identifierHash,encryptPhone,studentCode,publicEmail,publicStudent,findAccount} from './lib/identifiers.js';
import {recoveryRoutes,recoveryDelivery} from './lib/recovery.js';
import {supabaseAuth} from './lib/supabase-auth.js';
import {authRecoveryRoutes} from './lib/auth-recovery.js';
import { openDatabase } from './lib/database.js';
import { catechistRoutes } from './lib/catechists.js';
import { clientAddress } from './lib/client-address.js';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const root = path.dirname(fileURLToPath(import.meta.url));
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
const token = () => randomBytes(32).toString('base64url');
const now = () => new Date().toISOString();
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const hash = value => createHash('sha256').update(value).digest('hex');
export function passwordHash(password) { const salt = token(); return salt + ':' + scryptSync(password, salt, 64).toString('hex'); }
function passwordMatches(password, saved) { const [salt, key] = saved.split(':'); return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(key, 'hex')); }
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
const text = (v, max = 200) => String(v ?? '').trim().slice(0, max);
function validPassword(p) { if (typeof p !== 'string' || p.length < 8 || p.length > 128) fail('A senha deve ter entre 8 e 128 caracteres.'); }
function validEmail(e) { const v = text(e).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail('Informe um e-mail válido.'); return v; }
function validDate(v) { const d = new Date(v + 'T12:00:00Z'); if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== v) fail('Data inválida.'); return v; }

export async function createApp({ dbPath = path.join(root, 'data', 'presenca.sqlite'), seed = false, provider = process.env.DB_PROVIDER || 'sqlite', schema = process.env.DATABASE_SCHEMA || 'presenca', identityKey=process.env.IDENTITY_KEY, authProvider=supabaseAuth(), delivery=recoveryDelivery(), origin=process.env.APP_ORIGIN||'https://presenca-qr.vercel.app', defer=task=>task } = {}) {
 const db = await openDatabase({provider, dbPath, schema});
 const get = db.get;
 const all = db.all;
 const run = db.run;
 const tx = db.tx;
 const log = async (uid, action, entity, id, before, after, scope) => {
  const queries={students:'SELECT class_id FROM students WHERE id=?',calls:'SELECT class_id FROM calls WHERE id=?',attendance:'SELECT c.class_id FROM attendance a JOIN calls c ON c.id=a.call_id WHERE a.id=?',corrections:'SELECT s.class_id FROM corrections r JOIN students s ON s.id=r.student_id WHERE r.id=?'};
  const classId=scope??(entity==='classes'?id:queries[entity]?(await get(queries[entity],id))?.class_id:null);
  return run('INSERT INTO logs(user_id,action,entity,record_id,before_data,after_data,created_at,class_id) VALUES(?,?,?,?,?,?,?,?)',uid,action,entity,id,JSON.stringify(before??null),JSON.stringify(after??null),now(),classId??null);
 };
 const findUser=(value,type)=>findAccount(get,value,type,identityKey);
 const dummyPassword=passwordHash(token());
 const recoveryContext={get,run,findUser,hash,token,now,validPassword,passwordHash,fail,throttle,identityKey,delivery,origin,log};
 const recover=authProvider?authRecoveryRoutes({...recoveryContext,auth:authProvider}):recoveryRoutes(recoveryContext);
 async function checkPassword(user,candidate){
  if(!user?.supabase_user_id)return passwordMatches(candidate,user?.password||dummyPassword);
  if(!authProvider)fail('Autenticação temporariamente indisponível.',503);
  try{return await authProvider.login(user.email,candidate,user.supabase_user_id);}catch{fail('Autenticação temporariamente indisponível. Tente novamente.',503);}
 }
 const team=catechistRoutes({get,all,run,log,fail,text,validEmail,validPassword,passwordHash,passwordMatches:(candidate,_saved,user)=>checkPassword(user,candidate),token,hash,now,throttle,classAccess});
 async function seedData() {
  if ((await get('SELECT id FROM users LIMIT 1'))) return;
  (await tx(async () => {
   const pw = passwordHash('Demo@2026!');
   (await run("INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,'teacher',?)", 'Maria Oliveira', 'professor@demo.local', pw, now()));
   (await run('INSERT INTO classes(name,teacher_id,invite,created_at) VALUES(?,?,?,?)', 'Catequese • Sábado', 1, token(), now()));
   const names = ['Ana Clara Santos','Bernardo Lima','Clara Rodrigues','Davi Oliveira','Elisa Costa','Gabriel Souza','Helena Martins','João Pedro Alves','Laura Pereira','Miguel Ferreira'];
   for (let i=0;i<names.length;i++) {
    const email = i===0 ? 'aluno@demo.local' : `aluno${i+1}@demo.local`;
    const uid = Number((await run("INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,'student',?)",names[i],email,pw,now())).lastInsertRowid);
    const status = i<7?'approved':i<9?'pending':'rejected';
    (await run('INSERT INTO students(user_id,class_id,name,status,active,qr_token,qr_version,reason,terms_at,created_at,approved_at,approved_by) VALUES(?,1,?,?,?,?,1,?,?,?,?,?)',uid,names[i],status,i<7?1:0,i<7?token():null,i===9?'Confira a turma e procure o professor.':null,now(),now(),i<7?now():null,i<7?1:null));
   }
   for (const date of ['2026-09-01','2026-09-03']) {
    const cid = Number((await run("INSERT INTO calls(class_id,date,started_at,created_by) VALUES(1,?,?,1)", date, date+'T12:00:00Z')).lastInsertRowid);
    for (let i=1;i<=7;i++) (await run('INSERT INTO attendance(call_id,student_id,presence,scanned_at,mass,updated_at,updated_by) VALUES(?,?,?,?,?,?,1)',cid,i,i%3?'present':'absent',i%3?date+'T12:05:00Z':null,i%3===0?'unknown':i%2?'yes':'no',date+'T13:00:00Z'));
    (await run("UPDATE calls SET status='closed',ended_at=? WHERE id=?",date+'T13:00:00Z',cid));
   }
  }));
 }
 if (seed) (await seedData());
 await tx(async()=>{for(const row of await all('SELECT id FROM students WHERE student_code IS NULL'))await run('UPDATE students SET student_code=? WHERE id=?',studentCode(),row.id);});
 if (!(await get('SELECT id FROM users LIMIT 1')) && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  validPassword(process.env.ADMIN_PASSWORD);
  (await run("INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,'teacher',?)",process.env.ADMIN_NAME || 'Professor',validEmail(process.env.ADMIN_EMAIL),passwordHash(process.env.ADMIN_PASSWORD),now()));
 }
 async function classAccess(id, user) { const c = (await get('SELECT * FROM classes WHERE id=? AND id IN (SELECT class_id FROM teacher_classes WHERE user_id=?)',Number(id),user.id)); if (!c) fail('Turma não encontrada.',404); return c; }
 async function studentAccess(id,user) { const s = (await get('SELECT s.*,u.email FROM students s JOIN users u ON u.id=s.user_id JOIN classes c ON c.id=s.class_id WHERE s.id=? AND c.id IN (SELECT class_id FROM teacher_classes WHERE user_id=?)',Number(id),user.id)); if (!s) fail('Aluno não encontrado.',404); return s; }
 async function callAccess(id,user) { const c = (await get('SELECT a.*,t.mass_present_only,t.name AS class_name FROM calls a JOIN classes t ON t.id=a.class_id WHERE a.id=? AND t.id IN (SELECT class_id FROM teacher_classes WHERE user_id=?)',Number(id),user.id)); if (!c) fail('Chamada não encontrada.',404); return c; }
 async function inviteAccess(code) { const c = (await get('SELECT id,name FROM classes WHERE invite=? AND invite_enabled=1 AND open=1 AND active=1 AND (invite_expires IS NULL OR invite_expires>?)',code,now())); if (!c) fail('Convite inválido, vencido ou turma fechada.',404); return c; }
 async function callDetail(id,user) { const c = (await callAccess(id,user)); return {...c,rows:(await all('SELECT a.*,s.name,s.active,s.status FROM attendance a JOIN students s ON s.id=a.student_id WHERE a.call_id=? ORDER BY s.name',c.id))}; }
 const attempts = new Map();
 function throttle(key,max=15) { const t=Date.now(); let a=attempts.get(key); if(!a||a.until<t){a={count:0,until:t+15*60_000};attempts.set(key,a);} if(++a.count>max) fail('Muitas tentativas. Aguarde 15 minutos.',429); if(attempts.size>5000) for(const [k,v] of attempts) if(v.until<t) attempts.delete(k); }
 async function report(user, query) {
  const classId=Number(query.get('class_id')); const c=(await classAccess(classId,user));
  const month=query.get('month') || today().slice(0,7); if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('Mês inválido.');
  const from=month+'-01';
  const next=new Date(from+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
  const until=next.toISOString().slice(0,10);
  const calls=await all("SELECT * FROM calls WHERE class_id=? AND date>=? AND date<? AND status='closed' ORDER BY date",classId,from,until);
  const students=(await all("SELECT id,name,status,active FROM students WHERE class_id=? AND status='approved' AND active=1 ORDER BY name",classId));
  const recordsByStudent=new Map();
  for(const {student_id,...record} of await all("SELECT a.student_id,a.presence,a.mass,c.date,a.scanned_at FROM attendance a JOIN calls c ON c.id=a.call_id WHERE c.class_id=? AND c.date>=? AND c.date<? AND c.status='closed' ORDER BY c.date",classId,from,until)) {
   if(!recordsByStudent.has(student_id))recordsByStudent.set(student_id,[]);
   recordsByStudent.get(student_id).push(record);
  }
  const rows=students.map(s=>{const records=recordsByStudent.get(s.id)||[];const present=records.filter(x=>x.presence==='present').length;return {...s,records,total:records.length,present,absent:records.filter(x=>x.presence==='absent').length,percent:records.length?Math.round(present/records.length*100):0,yes:records.filter(x=>x.mass==='yes').length,no:records.filter(x=>x.mass==='no').length,unknown:records.filter(x=>x.mass==='unknown').length};});
  return {class_name:c.name,month,calls,rows};
 }
 const handler=async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','same-origin'); res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  let response,afterCommit;
  const respond=(body,status=200,headers={})=>{response={body,status,headers};};
  const send=(data,status=200)=>respond(JSON.stringify(data),status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  try {
   const url=new URL(req.url,'http://localhost'); const p=url.pathname; const method=req.method;
   if(!p.startsWith('/api/')) {
    const files={'/':'public/index.html','/app.js':'public/app.js','/style.css':'public/style.css','/vendor/zxing.js':'node_modules/@zxing/browser/umd/zxing-browser.min.js'};
    const file=files[p]; if(!file) fail('Página não encontrada.',404);
    res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');
    res.end(readFileSync(path.join(root,file)));return;
   }
   let body={}; if(['POST','PATCH','DELETE'].includes(method)) {
    if(req.headers.origin && req.headers.origin!==`${process.env.COOKIE_SECURE==='true'?'https':'http'}://${req.headers.host}`) fail('Origem não autorizada.',403);
    let raw=''; for await(const chunk of req) {raw+=chunk; if(Buffer.byteLength(raw)>16384) fail('Solicitação muito grande.',413);} try{body=raw?JSON.parse(raw):{};}catch{fail('JSON inválido.');}
   }
   await db.request(method, async()=>{
   const recovery=await recover(p,method,body,clientAddress(req));
   if(recovery){send(recovery.data);afterCommit=recovery.afterCommit;return;}
   if(p==='/api/login'&&method==='POST') {
    throttle('login:'+clientAddress(req));
    const identifier=text(body.identifier??body.email,254);
    const user=await findUser(identifier,body.identifier_type||undefined);
    throttle('account:'+(user?user.id:hash(identifier)),10);
    const candidate=typeof body.password==='string'&&body.password.length<=128?body.password:'';
    const matches=await checkPassword(user,candidate);
    if(!user||!matches) fail('Identificação ou senha incorretos.',401);
    const session=token(),csrf=token(); (await run('DELETE FROM sessions WHERE expires<?',Date.now()));(await run('INSERT INTO sessions VALUES(?,?,?,?)',hash(session),user.id,csrf,Date.now()+12*3600_000));
    res.setHeader('Set-Cookie',`session=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);
    send({ok:true});return;
   }
   if(p==='/api/invite'&&method==='GET') {send((await inviteAccess(url.searchParams.get('code')||'')));return;}
   if(p==='/api/register'&&method==='POST') {
    throttle('register:'+clientAddress(req),20); const c=(await inviteAccess(text(body.invite))); const name=text(body.name); if(name.length<3)fail('Informe seu nome completo.');
    const email=body.email?validEmail(body.email):null;
    if(email&&!publicEmail(email))fail('E-mail inválido.');
    validPassword(body.password);if(body.terms!==true)fail('É necessário aceitar os termos e a política de privacidade.');
    let phone,cpf;try{phone=body.phone?normalizePhone(body.phone):null;cpf=body.cpf?normalizeCPF(body.cpf):null;}catch(error){fail(error.message);}
    if(!email&&!phone)fail('Informe pelo menos um e-mail ou telefone de recuperação. O CPF sozinho não permite concluir o cadastro.');
    const phoneHash=phone?identifierHash('phone',phone,identityKey):null,cpfHash=cpf?identifierHash('cpf',cpf,identityKey):null;
    if(body.birth_date)validDate(body.birth_date);
    if((email&&await get('SELECT id FROM users WHERE email=?',email))||(phoneHash&&await get('SELECT id FROM users WHERE phone_hash=?',phoneHash))||(cpfHash&&await get('SELECT id FROM users WHERE cpf_hash=?',cpfHash)))fail('Já existe um cadastro com um dos identificadores informados.');
    // Legacy phones remain unchanged; compare normalized values until backfill is complete.
    if(phone)for(const legacy of await all("SELECT phone FROM students WHERE phone IS NOT NULL AND phone<>''")){try{if(normalizePhone(legacy.phone)===phone)fail('Já existe um cadastro com este telefone.');}catch(error){if(error.status)throw error;}}
    (await tx(async ()=>{const uid=Number((await run("INSERT INTO users(name,email,password,role,created_at,cpf_hash,phone_hash,phone_encrypted) VALUES(?,?,?,'student',?,?,?,?)",name,email||('conta-'+token()+'@cadastro.invalid'),passwordHash(body.password),now(),cpfHash,phoneHash,phone?encryptPhone(phone,identityKey):null)).lastInsertRowid);
     const sid=Number((await run('INSERT INTO students(user_id,class_id,name,phone,birth_date,guardian,guardian_phone,terms_at,created_at,student_code) VALUES(?,?,?,?,?,?,?,?,?,?)',uid,c.id,name,'',body.birth_date||null,text(body.guardian),text(body.guardian_phone,30),now(),now(),studentCode())).lastInsertRowid);(await log(uid,'register','students',sid,null,{status:'pending'}));}));send({ok:true},201);return;
   }
   const teamPublic=await team.publicRoute(p,method,body,url,clientAddress(req));
   if(teamPublic){send(teamPublic.data,teamPublic.status);return;}
   const sessionValue=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8)||'';
   const auth=(await get('SELECT u.id,u.name,u.email,u.role,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.active=1',hash(sessionValue),Date.now()));
   if(!auth)fail('Entre na sua conta para continuar.',401);
   if(method!=='GET'&&req.headers['x-csrf-token']!==auth.csrf)fail('Sessão inválida. Atualize a página.',403);
   if(p==='/api/me'&&method==='GET') {send({...auth,email:publicEmail(auth.email),student:auth.role==='student'?publicStudent(await get('SELECT s.*,u.phone_encrypted,c.name AS class_name,c.student_history FROM students s JOIN users u ON u.id=s.user_id JOIN classes c ON c.id=s.class_id WHERE s.user_id=?',auth.id),identityKey):null});return;}
   if(p==='/api/logout'&&method==='POST') {(await run('DELETE FROM sessions WHERE token_hash=?',hash(sessionValue)));res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');send({ok:true});return;}
   if(p==='/api/my-history'&&method==='GET') {const s=(await get('SELECT s.id,c.student_history FROM students s JOIN classes c ON c.id=s.class_id WHERE s.user_id=?',auth.id));if(!s||!s.student_history)fail('Histórico não autorizado.',403);send((await all('SELECT a.presence,a.mass,c.date FROM attendance a JOIN calls c ON c.id=a.call_id WHERE a.student_id=? ORDER BY c.date DESC',s.id)));return;}
   if(p==='/api/corrections'&&method==='POST'&&auth.role==='student') {const s=(await get('SELECT id FROM students WHERE user_id=?',auth.id));const message=text(body.message,2000);if(message.length<5)fail('Descreva a correção solicitada.');(await run('INSERT INTO corrections(student_id,message,created_at) VALUES(?,?,?)',s.id,message,now()));send({ok:true},201);return;}
   const qrMatch=p.match(/^\/api\/students\/(\d+)\/qr$/);
   if(qrMatch&&method==='GET') {
    const s=auth.role==='teacher'?(await studentAccess(qrMatch[1],auth)):(await get('SELECT * FROM students WHERE id=? AND user_id=?',Number(qrMatch[1]),auth.id));
    if(!s||s.status!=='approved'||!s.active||!s.qr_token)fail('QR Code indisponível.',403);
    const png=await QRCode.toBuffer('PRESENCA:'+s.qr_token,{width:700,margin:4,errorCorrectionLevel:'M'});
    const headers={'Content-Type':'image/png','Cache-Control':'no-store','Content-Disposition':`${url.searchParams.has('download')?'attachment':'inline'}; filename="qr-aluno-${s.id}.png"`};respond(png,200,headers);return;
   }
   if(auth.role!=='teacher')fail('Acesso exclusivo do professor.',403);
   const teamPrivate=await team.privateRoute(p,method,body,auth);
   if(teamPrivate){send(teamPrivate.data,teamPrivate.status);return;}
   if(p==='/api/classes'&&method==='GET') {send((await all("SELECT c.*,(SELECT count(*) FROM students s WHERE s.class_id=c.id AND s.status='approved' AND s.active=1) AS students,(SELECT count(*) FROM students s WHERE s.class_id=c.id AND s.status IN ('pending','correction')) AS pending FROM classes c WHERE c.id IN (SELECT class_id FROM teacher_classes WHERE user_id=?) ORDER BY c.name",auth.id)));return;}
   if(p==='/api/classes'&&method==='POST') {const name=text(body.name);if(name.length<2)fail('Informe o nome da turma.');const id=Number((await run('INSERT INTO classes(name,teacher_id,invite,created_at) VALUES(?,?,?,?)',name,auth.id,token(),now())).lastInsertRowid);(await log(auth.id,'create','classes',id,null,{name}));send({id},201);return;}
   const cm=p.match(/^\/api\/classes\/(\d+)$/);
   if(cm&&method==='PATCH') {const c=(await classAccess(cm[1],auth));const name=text(body.name??c.name);if(name.length<2)fail('Informe o nome da turma.');let expiry=body.invite_expires===undefined?c.invite_expires:body.invite_expires||null;if(expiry&& !Number.isFinite(Date.parse(expiry)))fail('Validade inválida.');
    if(expiry)expiry=new Date(expiry).toISOString();
    (await tx(async ()=>{(await run('UPDATE classes SET name=?,open=?,active=?,mass_present_only=?,student_history=?,invite=?,invite_enabled=?,invite_expires=? WHERE id=?',name,body.open===undefined?c.open:+!!body.open,body.active===undefined?c.active:+!!body.active,body.mass_present_only===undefined?c.mass_present_only:+!!body.mass_present_only,body.student_history===undefined?c.student_history:+!!body.student_history,body.renew?token():c.invite,body.invite_enabled===undefined?c.invite_enabled:+!!body.invite_enabled,expiry,c.id));(await log(auth.id,'update','classes',c.id,c,(await get('SELECT * FROM classes WHERE id=?',c.id))));}));send({ok:true});return;}
   if(p==='/api/students'&&method==='GET') {send((await all('SELECT s.*,u.email,u.phone_encrypted,c.name AS class_name FROM students s JOIN users u ON u.id=s.user_id JOIN classes c ON c.id=s.class_id WHERE c.id IN (SELECT class_id FROM teacher_classes WHERE user_id=?) ORDER BY s.name',auth.id)).map(s=>publicStudent(s,identityKey)));return;}
   const sm=p.match(/^\/api\/students\/(\d+)$/);
   if(sm&&method==='PATCH') {const s=(await studentAccess(sm[1],auth));const c=(await classAccess(body.class_id??s.class_id,auth));if(!c.active)fail('Turma inativa.');const status=body.status??s.status;if(!['approved','rejected','correction','pending'].includes(status))fail('Status inválido.');const reason=text(body.reason??s.reason,1000);if(['rejected','correction'].includes(status)&&!reason)fail('Informe o motivo.');const name=text(body.name??s.name);if(name.length<3)fail('Informe o nome completo.');
    const active=status==='approved'?(body.active===undefined?(s.status==='approved'?s.active:1):+!!body.active):0;
    (await tx(async ()=>{(await run('UPDATE students SET name=?,class_id=?,status=?,active=?,reason=?,qr_token=?,qr_version=?,approved_at=?,approved_by=? WHERE id=?',name,c.id,status,active,reason,status==='approved'?(s.qr_token||token()):null,s.qr_version+(status==='approved'&&!s.qr_token?1:0),status==='approved'?(s.approved_at||now()):s.approved_at,status==='approved'?(s.approved_by||auth.id):s.approved_by,s.id));(await run('UPDATE users SET name=? WHERE id=?',name,s.user_id));(await log(auth.id,'update','students',s.id,{name:s.name,class_id:s.class_id,status:s.status,active:s.active},{name,class_id:c.id,status,active,reason}));}));send({ok:true});return;}
   const rotate=p.match(/^\/api\/students\/(\d+)\/rotate$/);
   if(rotate&&method==='POST') {const s=(await studentAccess(rotate[1],auth));if(s.status!=='approved'||!s.active)fail('Aluno não está ativo e aprovado.');(await tx(async ()=>{(await run('UPDATE students SET qr_token=?,qr_version=qr_version+1 WHERE id=?',token(),s.id));(await log(auth.id,'rotate_qr','students',s.id,{version:s.qr_version},{version:s.qr_version+1}));}));send({ok:true});return;}
   if(p==='/api/corrections'&&method==='GET') {send((await all('SELECT r.*,s.name FROM corrections r JOIN students s ON s.id=r.student_id JOIN classes c ON c.id=s.class_id WHERE c.id IN (SELECT class_id FROM teacher_classes WHERE user_id=?) ORDER BY r.created_at DESC',auth.id)));return;}
   const correction=p.match(/^\/api\/corrections\/(\d+)$/);
   if(correction&&method==='PATCH'){const r=(await get('SELECT r.* FROM corrections r JOIN students s ON s.id=r.student_id JOIN classes c ON c.id=s.class_id WHERE r.id=? AND c.id IN (SELECT class_id FROM teacher_classes WHERE user_id=?)',Number(correction[1]),auth.id));if(!r)fail('Solicitação não encontrada.',404);(await tx(async ()=>{(await run("UPDATE corrections SET status='reviewed',reviewed_at=?,reviewed_by=? WHERE id=?",now(),auth.id,r.id));(await log(auth.id,'review','corrections',r.id,{status:r.status},{status:'reviewed'}));}));send({ok:true});return;}
   if(p==='/api/calls'&&method==='GET') {send((await all('SELECT a.*,c.name AS class_name,count(p.id) AS total,sum(CASE WHEN p.presence=\'present\' THEN 1 ELSE 0 END) AS present,sum(CASE WHEN p.presence=\'absent\' THEN 1 ELSE 0 END) AS absent,sum(CASE WHEN p.mass=\'unknown\' THEN 1 ELSE 0 END) AS unknown FROM calls a JOIN classes c ON c.id=a.class_id LEFT JOIN attendance p ON p.call_id=a.id WHERE c.id IN (SELECT class_id FROM teacher_classes WHERE user_id=?) GROUP BY a.id,c.name ORDER BY a.date DESC,a.id DESC',auth.id)));return;}
   if(p==='/api/calls'&&method==='POST') {const c=(await classAccess(body.class_id,auth));if(!c.active)fail('Turma inativa.');const date=validDate(body.date);if(date>today())fail('Não é possível fazer chamada futura.');const existing=(await get('SELECT id FROM calls WHERE class_id=? AND date=?',c.id,date));if(existing){send(existing);return;}
    const id=(await tx(async ()=>{const id=Number((await run('INSERT INTO calls(class_id,date,started_at,created_by) VALUES(?,?,?,?)',c.id,date,now(),auth.id)).lastInsertRowid);for(const s of (await all("SELECT id FROM students WHERE class_id=? AND status='approved' AND active=1",c.id)))(await run('INSERT INTO attendance(call_id,student_id) VALUES(?,?)',id,s.id));(await log(auth.id,'start','calls',id,null,{class_id:c.id,date}));return id;}));send({id},201);return;}
   const callm=p.match(/^\/api\/calls\/(\d+)$/);
   if(callm&&method==='GET'){send((await callDetail(callm[1],auth)));return;}
   const scan=p.match(/^\/api\/calls\/(\d+)\/scan$/);
   if(scan&&method==='POST') {const c=(await callAccess(scan[1],auth));if(c.status!=='open')fail('Chamada encerrada.');const raw=text(body.token,100),code=text(body.code,20).toUpperCase().replace(/[ -]/g,'');
    if(body.code!==undefined&&!/^[A-F0-9]{10}$/.test(code))fail('Código do aluno inválido.');
    const s=body.code!==undefined?await get('SELECT * FROM students WHERE student_code=?',code):await get('SELECT * FROM students WHERE qr_token=?',raw.replace(/^PRESENCA:/,''));if(!s)fail(body.code!==undefined?'Código do aluno não encontrado.':'QR Code inválido ou bloqueado.');if(s.status!=='approved'||!s.active)fail('Aluno inativo.');if(s.class_id!==c.class_id)fail('Aluno não pertence a esta turma.');const a=(await get('SELECT * FROM attendance WHERE call_id=? AND student_id=?',c.id,s.id));if(!a)fail('Aluno não fazia parte da turma no início desta chamada.');if(a.presence==='present')fail('Presença já registrada.',409);
    (await tx(async ()=>{(await run("UPDATE attendance SET presence='present',scanned_at=?,updated_at=?,updated_by=? WHERE id=?",now(),now(),auth.id,a.id));(await log(auth.id,'scan','attendance',a.id,{presence:a.presence},{presence:'present'}));}));send({student_id:s.id,name:s.name,mass:a.mass,message:'Presença registrada'});return;}
   const close=p.match(/^\/api\/calls\/(\d+)\/close$/);
   if(close&&method==='POST') {const c=(await callAccess(close[1],auth));if(body.confirm!==true)fail('Confirme o encerramento.');if(c.status!=='open')fail('Chamada já encerrada.');(await tx(async ()=>{(await run("UPDATE attendance SET presence='absent',updated_at=?,updated_by=? WHERE call_id=? AND presence='unregistered'",now(),auth.id,c.id));(await run("UPDATE calls SET status='closed',ended_at=? WHERE id=?",now(),c.id));(await log(auth.id,'close','calls',c.id,{status:'open'},{status:'closed',unregistered:'absent'}));}));send({ok:true});return;}
   const att=p.match(/^\/api\/calls\/(\d+)\/attendance$/);
   if(att&&method==='PATCH') {const c=(await callAccess(att[1],auth));const ids=Array.isArray(body.student_ids)?[...new Set(body.student_ids.map(Number))]:[Number(body.student_id)];if(!ids.length||ids.length>500)fail('Selecione os alunos.');if(body.presence!==undefined&&!['present','absent'].includes(body.presence))fail('Presença inválida.');if(body.mass!==undefined&&!['yes','no','unknown'].includes(body.mass))fail('Opção de missa inválida.');
    (await tx(async ()=>{for(const sid of ids){const a=(await get('SELECT * FROM attendance WHERE call_id=? AND student_id=?',c.id,sid));if(!a)fail('Aluno não faz parte desta chamada.');const presence=body.presence??a.presence;const mass=body.mass??a.mass;if(c.mass_present_only&&presence!=='present'&&mass!=='unknown')fail('Esta turma permite registrar missa somente para presentes.');(await run('UPDATE attendance SET presence=?,mass=?,updated_at=?,updated_by=? WHERE id=?',presence,mass,now(),auth.id,a.id));(await log(auth.id,'correct','attendance',a.id,{presence:a.presence,mass:a.mass},{presence,mass}));}}));send({ok:true});return;}
   if(p==='/api/report'&&method==='GET'){send((await report(auth,url.searchParams)));return;}
   if(p==='/api/report.csv'&&method==='GET') {const r=(await report(auth,url.searchParams));const cell=x=>'"'+String(x??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';const rows=[['Aluno','Status','Turma','Mês','Encontros','Presenças','Faltas','Presença %','Missa: Sim','Missa: Não','Missa: Não informado',...r.calls.map(c=>c.date)],...r.rows.map(s=>[s.name,'Aprovado',r.class_name,r.month,s.total,s.present,s.absent,s.percent,s.yes,s.no,s.unknown,...r.calls.map(c=>{const a=s.records.find(a=>a.date===c.date);return a?`${a.presence==='present'?'Presente':'Ausente'} / Missa: ${{yes:'Sim',no:'Não',unknown:'Não informado'}[a.mass]}`:'Não matriculado na chamada';})])];const headers={'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="presencas-${r.month}.csv"`,'Cache-Control':'no-store'};respond('\uFEFF'+rows.map(r=>r.map(cell).join(';')).join('\r\n'),200,headers);return;}
   if(p==='/api/logs'&&method==='GET') {send(await all('SELECT l.*,u.name AS actor FROM logs l LEFT JOIN users u ON u.id=l.user_id WHERE l.class_id IN (SELECT class_id FROM teacher_classes WHERE user_id=?) OR (l.class_id IS NULL AND l.user_id=?) ORDER BY l.id DESC LIMIT 200',auth.id,auth.id));return;}
   fail('Recurso não encontrado.',404);
   });
  } catch(e) {
   res.removeHeader('Set-Cookie');
   if(!e.status) console.error('Falha na solicitação:', String(e.code || 'INTERNAL').replace(/[^A-Z0-9_]/g,''));
   const conflict = e.code === '23505' || String(e.code).startsWith('SQLITE_CONSTRAINT');
   send({error:e.status?e.message:conflict?'Já existe um registro com esses dados.':'Ocorreu um erro ao processar a solicitação.'},e.status||(conflict?409:500));
  }
  if(afterCommit)await defer(afterCommit());
  if(response){res.writeHead(response.status,response.headers);res.end(response.body);}
 };
 const server=http.createServer(handler);
 return {server,db,handler};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const {server,db}=await createApp({seed:process.argv.includes('--seed'), provider:process.argv.includes('--sqlite')?'sqlite':process.env.DB_PROVIDER||'sqlite'});
 const shutdown=()=>{server.close(async()=>{await db.close();process.exit(0);});server.closeIdleConnections();};
 process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
 server.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.log(`Presença (${db.provider}) disponível em http://localhost:${process.env.PORT||3000}${process.argv.includes('--seed')?' — demonstração: professor@demo.local / Demo@2026!':''}`));
}
