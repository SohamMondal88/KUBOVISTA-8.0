import { buildFirebase } from './build-firebase.mjs';
import { adsenseConfig } from './adsense-config.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
try { process.loadEnvFile(resolve(root,'.env')); } catch {}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const args=process.argv.slice(2); const option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const port=Number(option('--port')||process.env.PORT)||3000;const host=option('--host')||process.env.HOST||'0.0.0.0';
const endpoints=new Set(['account','travel-date','journal','config','profile','settings','bookings','payments','notifications','admin/quote','payments/create-order','payments/verify','payments/webhook']);
const publicFiles=new Set(['/ads.txt','/affiliates.js','/affiliate-data.js','/affiliates.css','/membership.js','/membership.css','/travel-date.js','/travel-date.css','/adsense.js','/adsense.css','/','/index.html','/amp.html','/styles.css','/app.js','/account.js','/journal.js','/company.js','/explore.js','/destination-meta.js','/partner-data.js','/travel-links.js','/booking-ui.js','/kubo.js','/kubo-knowledge.js','/navigation.css','/kubo.css','/data.js','/legal.js']);
const firebaseOutput=resolve(root,'.firebase-local');
await buildFirebase(firebaseOutput);
createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');const pathname=decodeURIComponent(url.pathname);
  if(pathname.startsWith('/api/')){
   const key=pathname.slice(5); const auth=key.startsWith('auth/');
   if(!auth&&!endpoints.has(key)){res.writeHead(404).end('Not found');return;}
   req.query=Object.fromEntries(url.searchParams);
   if(!auth&&key!=='payments/webhook'&&!['GET','HEAD'].includes(req.method)){
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>100000){res.writeHead(413).end();return;}}
    try{req.body=body?JSON.parse(body):{};}catch{res.writeHead(400).end('Invalid JSON');return;}
   }
   const accountRoute=['bookings','profile','settings','notifications'].includes(key);
   const {default:handler}=await import(new URL(accountRoute?'../api/account.js':auth?'../api/auth/[...all].js':`../api/${key}.js`,import.meta.url));
   await handler(req,res);return;
  }
  const firebaseAsset=/^\/firebase-(?:client|auth-client|messaging-sw|chunk-[A-Z0-9]+)\.js$/.test(pathname);
  if(!firebaseAsset&&!publicFiles.has(pathname)&&!/^\/assets\/[a-zA-Z0-9_.-]+$/.test(pathname)){res.writeHead(404).end('Not found');return;}
  const path=firebaseAsset?resolve(firebaseOutput,pathname.slice(1)):resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  let contents;try{contents=await readFile(path);}catch(error){if(error.code==='ENOENT'){res.writeHead(404).end('Not found');return;}throw error;}
  if(pathname==='/amp.html'){
   const ads=adsenseConfig(process.env);
   const html=contents.toString('utf8')
    .replace('<!-- ADSENSE_AMP_ACCOUNT -->',ads.ampAccount)
    .replace('<!-- ADSENSE_AMP_SCRIPTS -->',ads.ampScripts)
    .replace('<!-- ADSENSE_AMP_BODY -->',ads.ampBody);
   contents=Buffer.from(html);
  }
  res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff'}).end(req.method==='HEAD'?undefined:contents);
 }catch(error){console.error(error.message);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Service unavailable. Please try again.'}));}
}).listen(port,host,()=>console.log(`KuboVistas ready at http://${host}:${port}`));
