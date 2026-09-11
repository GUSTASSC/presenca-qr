import {createHmac,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

export function normalizeCPF(value){
 const input=String(value??'').trim();
 if(!/^[\d.\-\s]+$/.test(input))throw new Error('CPF inválido.');
 const digits=input.replace(/\D/g,'');
 if(digits.length!==11||/^(\d)\1+$/.test(digits))throw new Error('CPF inválido.');
 for(let size=9;size<=10;size++){
  let sum=0;for(let i=0;i<size;i++)sum+=Number(digits[i])*(size+1-i);
  const check=(sum*10)%11;
  if(Number(digits[size])!==(check===10?0:check))throw new Error('CPF inválido.');
 }
 return digits;
}
export function normalizePhone(value){
 const input=String(value??'').trim();
 if(!/^[+\d()\-\s]+$/.test(input))throw new Error('Telefone inválido. Use DDD e número.');
 let digits=input.replace(/\D/g,'');
 if(digits.startsWith('0055'))digits=digits.slice(2);
 if(digits.startsWith('55')&&[12,13].includes(digits.length))digits=digits.slice(2);
 if(!/^([1-9][1-9])([2-5]\d{7}|9\d{8})$/.test(digits))throw new Error('Telefone inválido. Use DDD e número.');
 return '55'+digits;
}
function keyBytes(key){
 if(typeof key!=='string'||Buffer.from(key,'base64url').length!==32)throw new Error('Configure IDENTITY_KEY no servidor.');
 return Buffer.from(key,'base64url');
}
export const identifierHash=(kind,value,key)=>createHmac('sha256',keyBytes(key)).update(kind+':'+value).digest('hex');
export function encryptPhone(value,key){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes(key),iv);
 const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),data].map(x=>x.toString('base64url')).join('.');
}
export function decryptPhone(value,key){
 const [iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64url'));
 const decipher=createDecipheriv('aes-256-gcm',keyBytes(key),iv);decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
}
export const studentCode=()=>randomBytes(5).toString('hex').toUpperCase();
export const publicEmail=email=>email?.endsWith('@cadastro.invalid')?null:email;
export function publicStudent(student,key){
 if(!student)return null;
 const {qr_token,phone,guardian_phone,cpf_hash,phone_hash,phone_encrypted,...safe}=student;
 const contact=phone_encrypted?decryptPhone(phone_encrypted,key):phone;
 return {...safe,...('email' in safe?{email:publicEmail(safe.email)}:{}),has_qr:!!qr_token,phone:contact?'•••• '+contact.replace(/\D/g,'').slice(-4):'',guardian_phone:guardian_phone?'•••• '+guardian_phone.replace(/\D/g,'').slice(-4):''};
}
export async function findAccount(get,input,type,key){
 const value=String(input??'').trim().slice(0,254);
 if(!value)return null;
 if(type==='email'||(!type&&value.includes('@'))){
  if(!publicEmail(value.toLowerCase()))return null;
  return get('SELECT * FROM users WHERE email=? AND active=1',value.toLowerCase());
 }
 const matches=[];
 for(const kind of type?[type]:['cpf','phone']){
  if(!['cpf','phone'].includes(kind))continue;
  let normalized;try{normalized=kind==='cpf'?normalizeCPF(value):normalizePhone(value);}catch{continue;}
  const account=await get(`SELECT * FROM users WHERE ${kind==='cpf'?'cpf_hash':'phone_hash'}=? AND active=1`,identifierHash(kind,normalized,key));
  if(account&&!matches.some(row=>row.id===account.id))matches.push(account);
 }
 if(matches.length>1)throw Object.assign(new Error('Selecione CPF ou telefone no tipo de identificação.'),{status:400});
 return matches[0]||null;
}
