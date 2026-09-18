import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { destinations, journeys, notes } from '../data.js';
test('all 28 requested destinations have unique, route-safe IDs and usable guides',()=>{
 assert.equal(destinations.length,28);
 assert.equal(new Set(destinations.map(d=>d.id)).size,28);
 for(const d of destinations){assert.match(d.id,/^[a-z]+(?:-[a-z]+)*$/);assert.ok(d.description.length>50);assert.equal(d.highlights.length,3);}
});
test('journey routes resolve to destination guides and every day has a plan',()=>{
 const ids=new Set(destinations.map(d=>d.id));
 for(const j of journeys){assert.equal(j.schedule.length,j.days);for(const id of j.stops)assert.ok(ids.has(id),id);}
});
test('guide routes are unique and contain article text',()=>{
 assert.equal(new Set(notes.map(n=>n.id)).size,notes.length);
 for(const n of notes)assert.ok(n.body.every(p=>p.length>60));
});
test('local photographs are actual JPEG files',async()=>{
 for(const file of ['himalaya.jpg','goa.jpg']){const data=await readFile(new URL('../assets/'+file,import.meta.url));assert.equal(data[0],255);assert.equal(data[1],216);assert.ok(data.length>10000);}
});
