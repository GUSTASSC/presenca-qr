import {createApp} from '../server.js';
import {waitUntil} from '@vercel/functions';

// Reuse the application's existing HTTP handler and connection pool per instance.
// A failed cold start may retry on the next request, without poisoning the cache.
let appPromise;
export default async function handler(req,res){
 try {
  if(!appPromise){
   if(process.env.DB_PROVIDER!=='postgres'||process.env.COOKIE_SECURE!=='true'){
    throw new Error('Vercel requires PostgreSQL and secure cookies.');
   }
   appPromise=createApp({provider:'postgres',seed:false,defer:task=>waitUntil(task)}).catch(error=>{appPromise=null;throw error;});
  }
  const app=await appPromise;
  await app.handler(req,res);
 } catch(error){
  console.error('Falha no servidor:',String(error.code||'INITIALIZATION_ERROR').replace(/[^A-Z0-9_]/g,''));
  if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify({error:'Serviço temporariamente indisponível. Tente novamente.'}));
 }
}
