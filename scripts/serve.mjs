import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const args = process.argv.slice(2);
const option = name => { const index=args.indexOf(name); return index>=0 ? args[index+1] : undefined; };
const port = Number(option('--port') || process.env.PORT) || 3000;
const host = option('--host') || process.env.HOST || '0.0.0.0';
createServer(async (req,res)=>{
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep) || pathname.split('/').some(part=>part.startsWith('.'))) {res.writeHead(403).end('Forbidden');return;}
    const data = await readFile(path);
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff'}).end(data);
  } catch {res.writeHead(404,{'Content-Type':'text/plain'}).end('Not found');}
}).listen(port,host,()=>console.log(`KUBOVISTA ready at http://${host}:${port}`));
