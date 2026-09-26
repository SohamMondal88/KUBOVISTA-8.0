import './patch-jwks-esm.mjs';
import { buildFirebase } from './build-firebase.mjs';
import {validateAffiliateOffers} from '../affiliates.js';
import {affiliateOffers} from '../affiliate-data.js';
import { adsenseConfig } from './adsense-config.mjs';
import { mkdir, copyFile, cp, rm, readFile, writeFile } from 'node:fs/promises';
const offers = validateAffiliateOffers(process.env.AFFILIATE_OFFERS_JSON ? JSON.parse(process.env.AFFILIATE_OFFERS_JSON) : affiliateOffers);
const ads = adsenseConfig(process.env);
const root = new URL('../',import.meta.url);
const output = new URL('dist/',root);
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for (const name of ['affiliates.js','affiliate-data.js','affiliates.css','membership.js','membership.css','travel-date.js','travel-date.css','adsense.js','adsense.css','index.html','amp.html','styles.css','app.js','account.js','journal.js','company.js','explore.js','destination-meta.js','partner-data.js','travel-links.js','booking-ui.js','kubo.js','kubo-knowledge.js','navigation.css','kubo.css','data.js','legal.js']) await copyFile(new URL(name,root),new URL(name,output));
await cp(new URL('assets/',root),new URL('assets/',output),{recursive:true});
const html = await readFile(new URL('index.html',output),'utf8');
await writeFile(new URL('index.html',output),html.replace('<!-- ADSENSE_CONFIG -->',ads.head));
const amp = await readFile(new URL('amp.html',output),'utf8');
const configuredAmp = amp
  .replace('<!-- ADSENSE_AMP_ACCOUNT -->',ads.ampAccount)
  .replace('<!-- ADSENSE_AMP_SCRIPTS -->',ads.ampScripts)
  .replace('<!-- ADSENSE_AMP_BODY -->',ads.ampBody);
await writeFile(new URL('amp.html',output),configuredAmp);
await writeFile(new URL('ads.txt',output),ads.adsTxt);
await writeFile(new URL('affiliate-data.js',output),'export const affiliateOffers = '+JSON.stringify(offers)+';\n');
await buildFirebase(output);
console.log('Production site built in dist/');
