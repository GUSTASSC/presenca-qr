import {readFileSync,writeFileSync} from 'node:fs';
const ref='omsyrikdarkjhqscbowp',base=`https://api.supabase.com/v1/projects/${ref}/config/auth`;
const access=readFileSync('C:/Users/Best/.supabase/access-token','utf8').trim();
const headers={Authorization:`Bearer ${access}`,'Content-Type':'application/json'};
let response=await fetch(base,{headers});if(!response.ok)throw Error('AUTH_CONFIG_READ_FAILED');
const before=await response.json();
writeFileSync(`data/backups/auth-config-${Date.now()}.json`,JSON.stringify(before,null,2),{mode:0o600});
const origin='https://presenca-qr.vercel.app';
const changes={site_url:origin,uri_allow_list:[...new Set([...(before.uri_allow_list||'').split(',').filter(Boolean),origin])].join(','),password_min_length:8,mailer_templates_recovery_content:'<h2>Redefinir sua senha — Presença</h2><p>Recebemos uma solicitação para recuperar seu acesso.</p><p><a href="{{ .SiteURL }}/#auth-reset/{{ .TokenHash }}">Definir nova senha</a></p><p>O link só pode ser usado uma vez. Se você não solicitou, ignore esta mensagem.</p>',mailer_subjects_recovery:'Redefinir sua senha — Presença'};
if(!before.smtp_host){
 writeFileSync('supabase/recovery-email.html',changes.mailer_templates_recovery_content);
 delete changes.mailer_templates_recovery_content;delete changes.mailer_subjects_recovery;
 console.log('SMTP ausente: template salvo localmente; instalação pendente até configurar SMTP.');
}
response=await fetch(base,{method:'PATCH',headers,body:JSON.stringify(changes)});if(!response.ok){const detail=await response.json();console.log('Motivo:',String(detail.message||detail.error||'').replace(/sb[p_]_[A-Za-z0-9_-]+/g,'[redacted]').slice(0,500));throw Error('AUTH_CONFIG_UPDATE_FAILED_'+response.status);}
response=await fetch(base,{headers});const after=await response.json();
if(!response.ok||Object.entries(changes).some(([k,v])=>after[k]!==v))throw Error('AUTH_CONFIG_VERIFICATION_FAILED');
console.log('Site URL, redirect e senha mínima configurados e verificados. Template instalado nesta execução:',!!before.smtp_host);
