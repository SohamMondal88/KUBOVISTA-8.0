import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname);
try { process.loadEnvFile(resolve(root,'.env')); } catch {}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const args=process.argv.slice(2); const option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const port=Number(option('--port')||process.env.PORT)||3000;const host=option('--host')||process.env.HOST||'0.0.0.0';
const endpoints=new Set(['journal','config','profile','settings','bookings','payments','notifications','admin/quote','payments/create-order','payments/verify','payments/webhook']);
const publicFiles=new Set(['/adsense.js','/adsense.css','/','/index.html','/styles.css','/app.js','/account.js','/journal.js','/company.js','/explore.js','/destination-meta.js','/partner-data.js','/travel-links.js','/booking-ui.js','/kubo.js','/kubo-knowledge.js','/navigation.css','/kubo.css','/data.js','/legal.js']);
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
   const {default:handler}=await import(new URL(auth?'../api/auth/[...all].js':`../api/${key}.js`,import.meta.url));
   await handler(req,res);return;
  }
  if(!publicFiles.has(pathname)&&!/^\/assets\/[a-zA-Z0-9_.-]+$/.test(pathname)){res.writeHead(404).end('Not found');return;}
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff'}).end(await readFile(path));
 }catch(error){console.error(error.message);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Service unavailable. Please try again.'}));}
}).listen(port,host,()=>console.log(`KuboVistas ready at http://${host}:${port}`));
