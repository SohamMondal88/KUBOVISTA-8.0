import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { destinations, journeys, notes } from '../data.js';
import { legalPages, legalOrder } from '../legal.js';
test('all 28 requested destinations have unique, route-safe IDs and usable guides',()=>{
 assert.equal(destinations.length,28);
 assert.equal(new Set(destinations.map(d=>d.id)).size,28);
 for(const d of destinations){assert.match(d.id,/^[a-z]+(?:-[a-z]+)*$/);assert.ok(d.description.length>50);assert.equal(d.highlights.length,3);}
});
test('journey routes resolve to destination guides and every day has a plan',()=>{
 const ids=new Set(destinations.map(d=>d.id));
 for(const j of journeys){assert.equal(j.schedule.length,j.days);for(const id of j.stops)assert.ok(ids.has(id),id);}
});
test('editorial guides are original, substantial, attributed and source-backed',()=>{
 assert.equal(new Set(notes.map(n=>n.id)).size,notes.length);
 assert.ok(notes.length>=8,'publish a useful editorial library, not a token set of posts');
 for(const n of notes){
  assert.ok(n.wordCount>=300,`${n.id} is too thin`);
  assert.ok(n.sections.length>=4,`${n.id} needs a clear reader-focused structure`);
  assert.ok(n.body.every(p=>p.length>60));
  assert.match(n.published,/^\d{4}-\d{2}-\d{2}$/);
  assert.match(n.updated,/^\d{4}-\d{2}-\d{2}$/);
  assert.ok(n.sources.length>=2,`${n.id} needs official planning resources`);
  assert.ok(n.sources.every(source=>source.href.startsWith('https://')));
 }
});
test('local photographs are actual JPEG files',async()=>{
 for(const file of ['himalaya.jpg','goa.jpg']){const data=await readFile(new URL('../assets/'+file,import.meta.url));assert.equal(data[0],255);assert.equal(data[1],216);assert.ok(data.length>10000);}
});
test('responsive navigation and motion controls are present',async()=>{
 const [html,css,app]=await Promise.all([
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../styles.css',import.meta.url),'utf8'),
  readFile(new URL('../app.js',import.meta.url),'utf8')
 ]);
 for(const id of ['scroll-progress-bar','nav-backdrop','mobile-saved','back-to-top'])assert.match(html,new RegExp(`id="${id}"`));
 for(const query of ['min-width:701px','max-width:950px','max-width:700px','max-width:390px','hover:none','prefers-reduced-motion:reduce'])assert.ok(css.includes(query),`missing responsive rule ${query}`);
 assert.match(app,/function closeMenu\(/);
 assert.match(app,/function updateDock\(/);
 assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'CSS braces should be balanced');
});
test('legal centre includes every required policy and route',async()=>{
 const [html,app,build]=await Promise.all([
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../app.js',import.meta.url),'utf8'),
  readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8')
 ]);
 assert.deepEqual(legalOrder,['privacy','terms','cookies','cancellation','disclaimer','accessibility','grievance','copyright']);
 for(const id of legalOrder){
  assert.ok(legalPages[id],`missing ${id} policy`);
  assert.ok(legalPages[id].sections.length>=4,`${id} policy is too thin`);
  assert.ok(app.includes(`case'${id}'`),`missing ${id} route`);
 }
 assert.match(html,/href="\/legal"/);
 assert.match(app,/function legalHub\(/);
 assert.match(app,/function legalPage\(/);
 assert.match(build,/'legal\.js'/);
});
