import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const ref='omsyrikdarkjhqscbowp';
const access=readFileSync(new URL('file:///C:/Users/Best/.supabase/access-token'),'utf8').trim();
const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`,{headers:{Authorization:`Bearer ${access}`}});
if(!response.ok)throw Error('AUTH_CONFIG_HTTP_'+response.status);
const config=await response.json();
mkdirSync('data/backups',{recursive:true});
writeFileSync('data/backups/auth-config-before.json',JSON.stringify(config,null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify({smtp_configured:!!config.smtp_host,email_enabled:config.external_email_enabled,email_autoconfirm:config.mailer_autoconfirm,site_url:config.site_url,redirects:config.uri_allow_list,password_min_length:config.password_min_length}));
