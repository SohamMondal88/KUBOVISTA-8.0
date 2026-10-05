import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicSeoRoutes,privateSeoRoutes} from '../scripts/seo.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const header=html.match(/<header id="header">([\s\S]*?)<\/header>/)?.[1];
const footer=html.match(/<footer class="vista-footer">([\s\S]*?)<\/footer>/)?.[1];
test('site shell has unique IDs and accessible navigation landmarks',()=>{
 assert.ok(header&&footer);
 const ids=[...html.matchAll(/\bid="([a-z0-9-]+)"/g)].map(x=>x[1]);
 assert.equal(new Set(ids).size,ids.length);
 assert.match(header,/<nav aria-label="Main navigation" id="nav">/);
 assert.match(header,/<button[^>]+id="menu-toggle"[^>]+aria-expanded="false"[^>]+aria-controls="nav"/);
 assert.match(html,/<a href="#main" class="skip">/);
 assert.match(footer,/data-social-links/);
});
test('primary routes and footer contact destinations have published page targets',()=>{
 const known=new Set([...publicSeoRoutes,...privateSeoRoutes].map(page=>page.path));
 const links=[...header.matchAll(/<a\s+[^>]*href="(\/[^"?]*)/g),...footer.matchAll(/<a\s+[^>]*href="(\/[^"?]*)/g)].map(x=>x[1]);
 assert.ok(links.length>25);
 for(const path of links)assert.ok(known.has(path),`Missing page target: ${path}`);
 const primary=header.match(/<nav aria-label="Main navigation" id="nav">([\s\S]*?)<\/nav>/)?.[1];
 const direct=[...primary.matchAll(/<a href="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(direct,[
  '/destinations',
  '/packages',
  '/company/about',
  '/company/contact',
  '/travel-date',
  '/journal',
 ]);
});
