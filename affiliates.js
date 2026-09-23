import { affiliateOffers } from './affiliate-data.js';
const providers = {
 amazon: {name:'Amazon India',hosts:['amazon.in','www.amazon.in','amzn.to']},
 booking: {name:'Booking.com',hosts:['booking.com','www.booking.com']},
 viator: {name:'Viator',hosts:['viator.com','www.viator.com']}
};
const categories={gear:'Packing & equipment',stays:'Places to stay',experiences:'Local experiences'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateAffiliateOffers(input){
 if(!Array.isArray(input)||input.length>30)throw Error('Affiliate configuration must be an array with at most 30 offers.');
 const ids=new Set();
 return input.filter(o=>o?.approved===true).map(o=>{
  if(!/^[a-z0-9-]{1,60}$/.test(o.id||'')||ids.has(o.id))throw Error('Affiliate offer IDs must be unique lowercase slugs.');ids.add(o.id);
  const provider=Object.hasOwn(providers,o.provider)?providers[o.provider]:null;
  if(!provider||!Object.hasOwn(categories,o.category))throw Error('Choose a supported affiliate provider and category.');
  let url;try{url=new URL(o.url);}catch{throw Error('Affiliate links require a valid HTTPS URL.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||!provider.hosts.includes(url.hostname))throw Error('Affiliate link host is not approved for this provider.');
  if(typeof o.title!=='string'||o.title.trim().length<4||o.title.length>90||typeof o.description!=='string'||o.description.trim().length<15||o.description.length>300)throw Error('Add a clear affiliate title (4–90 characters) and description (15–300 characters).');
  if(!Array.isArray(o.placements)||!o.placements.length||o.placements.length>20||o.placements.some(p=>typeof p!=='string'||! /^(journal|guide:[a-z0-9-]{1,80}|story:[a-z0-9-]{1,80})$/.test(p)))throw Error('Use explicit journal, guide:ID or story:ID placements.');
  return {id:o.id,provider:o.provider,category:o.category,title:o.title.trim(),description:o.description.trim(),url:url.href,placements:o.placements,approved:true};
 });
}
export function affiliateSection(placement,offers=affiliateOffers){
 const selected=validateAffiliateOffers(offers).filter(o=>o.placements.includes(placement)).slice(0,3);
 const amazon=selected.some(o=>o.provider==='amazon');
 const resources=selected.length?`<section class="wrap affiliate-section" aria-label="Affiliate travel resources"><div class="affiliate-heading"><div><span class="eyebrow green">RESOURCES FOR YOUR NEXT CHAPTER</span><h2>From a good read<br>to a <em>thoughtful trip.</em></h2></div><span class="affiliate-label">Affiliate links</span></div><p class="affiliate-disclosure"><strong>Affiliate disclosure:</strong> KuboVistas may earn a commission if you make a qualifying purchase or booking through these links. These are KuboVistas placements, separate from the article author’s recommendations.${amazon?' As an Amazon Associate I earn from qualifying purchases.':''}</p><div class="affiliate-grid">${selected.map(o=>`<article class="affiliate-card"><span class="eyebrow">${categories[o.category]}</span><h3>${esc(o.title)}</h3><p>${esc(o.description)}</p><div class="affiliate-provider">Via ${providers[o.provider].name}</div><a class="button outline" href="${esc(o.url)}" target="_blank" rel="sponsored noopener noreferrer">View on ${providers[o.provider].name} ↗<span class="sr-only"> (affiliate link, opens in a new tab)</span></a><small>Check current price, availability and terms on the provider’s website.</small></article>`).join('')}</div><p class="affiliate-footnote">Purchases take place with the provider. Prices, availability and cancellation or return terms are set there. <a href="#/privacy">How affiliate links use data ↗</a></p></section>`:'';
 return resources+`<section class="wrap affiliate-planning"><div><span class="eyebrow green">MAKE THE STORY YOUR OWN</span><h2>A place in mind?<br><em>Let’s shape your trip.</em></h2><p>Tell us your dates, group size and budget. Ask for a personalised planning quotation for a solo escape, couple getaway, family holiday or student group.</p></div><div class="affiliate-planning-actions"><a class="button" href="#/contact?kind=contact&subject=${encodeURIComponent('I would like a personalised trip-planning quotation after reading '+placement+'. Please share the scope, price and availability.')}">Ask for a planning quote ↗</a><a class="underlined" href="#/planner">Start with the free planner ↗</a></div></section>`;
}
