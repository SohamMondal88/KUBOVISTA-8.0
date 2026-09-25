import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=await readFile(new URL('../client/firebase.js',import.meta.url),'utf8');
function context(){
 const stored=new Map();
 const ctx={location:{origin:'https://kubo.example',hash:'#/destinations?email=private@example.com'},localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},document:{getElementById:()=>null},addEventListener(){},Event,console};ctx.window=ctx;
 vm.createContext(ctx);vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
 vm.runInContext(source.replace(/^import .*$/gm,'').replace(/^export const app =.*$/m,'').replace(/\bexport /g,''),ctx);
 return ctx;
}
test('head contains one Google tag and one supplied AdSense publisher script',()=>{
 assert.equal((html.match(/src="https:\/\/www.googletagmanager.com\/gtag\/js\?id=G-MMP3139QSB"/g)||[]).length,1);
 assert.equal((html.match(/src="https:\/\/pagead2.googlesyndication.com\/pagead\/js\/adsbygoogle.js\?client=ca-pub-3851312120061760"/g)||[]).length,1);
 assert.equal(source.includes("import('firebase/analytics')"),false);
 assert.equal(html.includes('G-C0ZK56K9YQ'),false);
});
test('Analytics stays disabled until opt-in and sends sanitized public events only',async()=>{
 const ctx=context();const events=()=>ctx.dataLayer.filter(v=>v[0]==='event');
 assert.equal(ctx['ga-disable-G-MMP3139QSB'],true);assert.equal(events().length,0);
 await ctx.setAnalyticsConsent(true);assert.equal(ctx['ga-disable-G-MMP3139QSB'],false);
 assert.equal(events().length,1);assert.equal(events()[0][2].page_location,'https://kubo.example/#/destinations');
 ctx.location.hash='#/booking/private-booking-id?token=secret';ctx.trackPublicPage();assert.equal(events().length,1);
 await ctx.setAnalyticsConsent(false);ctx.location.hash='#/about';ctx.trackPublicPage();assert.equal(events().length,1);
 assert.equal(ctx['ga-disable-G-MMP3139QSB'],true);
});
