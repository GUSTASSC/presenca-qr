import {isIP} from 'node:net';

export function clientAddress(req,env=process.env){
 // Only trust the header in Vercel's managed runtime, which overwrites it.
 const forwarded=req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for'];
 if(env.VERCEL==='1'&&typeof forwarded==='string'&&isIP(forwarded.trim()))return forwarded.trim();
 return req.socket.remoteAddress;
}
