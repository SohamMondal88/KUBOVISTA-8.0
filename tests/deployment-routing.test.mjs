import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir,readFile } from 'node:fs/promises';
import handler,{accountResource} from '../api/account.js';
const names=['bookings','profile','settings','notifications'];
const request=(url,query={},method='GET')=>({url,query,method,headers:{}});
async function response(req){let body;const res={statusCode:200,setHeader(){},end(value){body=JSON.parse(value);}};await handler(req,res);return {status:res.statusCode,body};}
test('legacy URLs and rewritten URLs resolve to the same allowlisted account handlers',()=>{
 for(const name of names){assert.equal(accountResource(request('/api/'+name+'?id=trip',{id:'trip'})),name);assert.equal(accountResource(request('/api/account?resource='+name,{resource:name,id:'trip'})),name);}
 assert.equal(accountResource(request('/api/profile',{resource:'bookings'})),'profile');
});
test('unknown, prototype, traversal and repeated routing values are rejected',async()=>{
 for(const resource of ['unknown','__proto__','constructor','../auth',['profile','bookings']]){const r=await response(request('/api/account',{resource}));assert.equal(r.status,404);}
 assert.equal((await response(request('/api/auth/sign-in/email',{resource:'profile'}))).status,404);
});
test('grouped account endpoints still reject anonymous reads and cross-origin mutations',async()=>{
 const previous=process.env.BETTER_AUTH_SECRET;process.env.BETTER_AUTH_SECRET='';
 try{for(const name of names){assert.equal((await response(request('/api/'+name))).status,401);const method=name==='bookings'?'POST':name==='notifications'?'PATCH':'PUT';assert.equal((await response(request('/api/'+name,{},method))).status,403);}}
 finally{if(previous===undefined)delete process.env.BETTER_AUTH_SECRET;else process.env.BETTER_AUTH_SECRET=previous;}
});
test('method restrictions stay in the original handler',async()=>{
 const r=await response(request('/api/account',{resource:'bookings'},'DELETE'));assert.equal(r.status,405);
});
test('deployment stays within twelve entry points and preserves explicit account rewrites',async()=>{
 const files=await readdir(new URL('../api/',import.meta.url),{recursive:true});const entries=files.filter(p=>p.endsWith('.js'));
 assert.equal(entries.length,10);assert.ok(entries.length<=12);
 for(const name of names)assert.ok(!entries.includes(name+'.js'));
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 for(const name of names)assert.ok(config.rewrites.some(r=>r.source==='/api/'+name&&r.destination==='/api/account?resource='+name));
 assert.ok(!config.rewrites.some(r=>r.source.includes('auth')||r.source.includes('webhook')));
 for(const path of ['auth/[...all].js','payments/webhook.js'])assert.match(await readFile(new URL('../api/'+path,import.meta.url),'utf8'),/bodyParser: false/);
});
