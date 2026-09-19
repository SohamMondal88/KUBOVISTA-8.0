import test from 'node:test';
import assert from 'node:assert/strict';
import {destinations} from '../data.js';
import {metadata,seasonalStatus,matchesExperience,indiaDate} from '../destination-meta.js';
import {dateOffset,weatherFor} from '../server/weather.js';
import services from '../server/services.js';

test('all destinations have map references and monthly guidance including unknown localities',()=>{
 for(const d of destinations){const p=metadata(d);assert.ok(p.lat>=6&&p.lat<=38&&p.lng>=67&&p.lng<=99,d.id);for(let m=1;m<=12;m++)assert.ok(['green','yellow','red'].includes(seasonalStatus(d,m).color));}
 assert.equal(seasonalStatus(destinations.find(d=>d.id==='samsu'),10).label,'Needs local review');
 assert.equal(seasonalStatus(destinations.find(d=>d.id==='goa'),12).color,'green');
 assert.equal(seasonalStatus(destinations.find(d=>d.id==='darjeeling'),7).color,'red');
 assert.equal(seasonalStatus(destinations.find(d=>d.id==='darjeeling'),9).color,'yellow');
});
test('experience filters support multiple tags while preserving coast links',()=>{
 const goa=destinations.find(d=>d.id==='goa');assert.equal(matchesExperience(goa,'Coast'),true);assert.equal(matchesExperience(goa,'Beaches'),true);assert.equal(matchesExperience(goa,'Crowded'),true);assert.equal(matchesExperience(goa,'Forest'),false);
 const added={id:'new-place',type:'Forest',tags:['Offbeat'],location:{lat:25,lng:80,season:'hills'}};assert.equal(metadata(added).lat,25);assert.equal(seasonalStatus(added,10).color,'green');
});
test('forecast date validation rejects impossible dates and computes exact horizon',()=>{
 assert.equal(dateOffset('2026-02-30','2026-02-01'),null);
 assert.equal(dateOffset('2026-09-34','2026-09-19'),null);
 assert.equal(dateOffset('2026-10-04','2026-09-19'),15);
 assert.equal(dateOffset('2026-10-05','2026-09-19'),16);
});
test('weather response selects actual provider day; never invents long-range or unknown-locality forecasts',async()=>{
 process.env.WEATHER_DEMO='true';delete process.env.OPEN_METEO_API_KEY;
 let calls=0;const today=indiaDate();const fake=async url=>{calls++;assert.equal(url.hostname,'api.open-meteo.com');assert.equal(url.searchParams.get('forecast_days'),'16');return {ok:true,json:async()=>({current:{temperature_2m:20,time:today+'T12:00'},daily:{time:[today],temperature_2m_max:[25],temperature_2m_min:[16]}})};};
 const current=await weatherFor('darjeeling',today,fake);assert.equal(current.daily.temperature_2m_max,25);
 const later=await weatherFor('darjeeling','2099-01-01',fake);assert.equal(later.daily,null);assert.equal(later.forecastAvailable,false);assert.equal(calls,1);
 assert.equal((await weatherFor('samsu',today,fake)).status,422);assert.equal((await weatherFor('not-real',today,fake)).status,404);
 delete process.env.WEATHER_DEMO;assert.equal((await weatherFor('goa',today,fake)).status,503);
});
test('disabled enquiries and unsigned inbox access fail closed',async()=>{
 delete process.env.DATABASE_URL;delete process.env.ENQUIRIES_ENABLED;
 const call=async req=>{let body;const res={setHeader(){},end(v){body=JSON.parse(v);}};await services(req,res);return {status:res.statusCode,body};};
 assert.equal((await call({method:'POST',query:{service:'enquiries'},headers:{}})).status,503);
 assert.equal((await call({method:'GET',query:{service:'enquiries'},headers:{}})).status,401);
 assert.equal((await call({method:'GET',query:{service:'contact-info'},headers:{}})).body.enquiries,false);
});
