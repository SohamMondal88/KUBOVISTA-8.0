import { mkdir, writeFile } from 'node:fs/promises';
import { destinations, notes } from '../data.js';
import { legalPages, legalOrder } from '../legal.js';

const origin = 'https://kubovista.com';
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const route = (path,title,description,heading,copy=description,extra={}) => ({path,title,description,heading,copy,index:true,...extra});

export const publicSeoRoutes = [
  route('/','KuboVistas | Thoughtful India Travel Guides & Tours','Explore thoughtful India travel guides, slow journeys and trip-planning ideas across North Bengal, Sikkim, Arunachal Pradesh, Goa and coastal Bengal.','Thoughtful India travel, at your pace.'),
  route('/destinations','India Travel Destinations & Tour Guides | KuboVistas','Browse 28 destination guides across the Himalayas, North Bengal, Sikkim, Arunachal Pradesh, Goa and coastal Bengal.','Explore travel destinations across India.'),
  ...destinations.map(d=>route(`/destinations/${d.id}`,`${d.name} Travel Guide & Tour Ideas | KuboVistas`,`${d.description} Suggested stay: ${d.duration}.`,`${d.name} travel guide`,d.tagline,{type:'TouristDestination',keywords:[d.region,d.type,...d.highlights]})),
  route('/journeys','India Tour Itineraries & Slow Journeys | KuboVistas','Explore flexible India tour itineraries for Himalayan hills, Sikkim and Goa, designed with realistic travel time and room to wander.','Flexible India tour itineraries.'),
  route('/guides','India Travel Tips & Practical Guides | KuboVistas','Read practical India travel guides covering slow itineraries, mountain packing and respectful local travel.','Practical travel advice for India.'),
  ...notes.map(n=>route(`/guides/${n.id}`,`${n.title} | KuboVistas Travel Guide`,`${n.intro} ${n.body[0]}`,n.title,n.body.join(' '),{type:'Article'})),
  route('/journal','India Travel Journal & Traveler Stories | KuboVistas','Read KuboVistas field notes and reviewed traveler stories from journeys across India.','India travel stories and field notes.'),
  route('/membership','KuboVistas Traveller’s Circle Membership','Explore free KuboVistas planning tools and proposed annual travel-planning support.','Travel planning support for curious explorers.'),
  route('/travel-date','Find India Travel Companions | KuboVistas','Discover the adults-only KuboVistas Travel Date companion finder for people with similar destinations, dates and budgets.','Find people heading in the same direction.'),
  route('/company/about','About KuboVistas | Thoughtful India Travel','Meet KuboVistas, an India travel company built around slower journeys, clear information and meaningful local experiences.','About KuboVistas.'),
  route('/company/contact','Contact KuboVistas Travel Team','Contact KuboVistas about India trip planning, partnerships, stays or travel questions.','Talk to the KuboVistas travel team.'),
  route('/company/stays','India Hotels, Homestays & Hostels | KuboVistas','Explore confirmed KuboVistas accommodation partners and enquire about hotels, homestays and hostels in India.','Places to stay on your India journey.'),
  route('/company/camping','Camping & Trekking Equipment in India | KuboVistas','Explore responsible camping and trekking support information from KuboVistas.','Camping and trekking support.'),
  route('/company/careers','Travel Careers at KuboVistas','Explore career and collaboration opportunities with KuboVistas.','Build thoughtful travel with us.'),
  route('/company/partnerships','Travel Partnerships | KuboVistas','Partner with KuboVistas as a stay, guide or responsible outdoor operator.','Partner with KuboVistas.'),
  route('/company/sponsors','Travel Sponsorships | KuboVistas','Discuss transparent, relevant travel sponsorship opportunities with KuboVistas.','Sponsor thoughtful travel content.'),
  route('/legal','KuboVistas Legal Centre','Read KuboVistas policies for privacy, cookies, travel planning, cancellations, accessibility and website use.','KuboVistas policies and traveler information.'),
  ...legalOrder.map(id=>route(`/legal/${id}`,`${legalPages[id].label} | KuboVistas`,legalPages[id].summary,legalPages[id].title,legalPages[id].summary))
];

export const privateSeoRoutes = [
  '/planner','/journal/write','/journal/my-stories','/journal/journal-review',
  '/company/enquiry-inbox',
  ...['login','signup','verify-email','forgot-password','reset-password','welcome','dashboard','profile','bookings','payments','notifications','settings','security','saved','admin','support'].map(x=>`/account/${x}`)
].map(path=>route(path,'KuboVistas Account','Secure KuboVistas account and trip-planning page.','Your KuboVistas account.','Sign in to continue.',{index:false}));

function jsonLd(page) {
  const graph=[
    {'@type':'Organization','@id':origin+'/#organization',name:'KuboVistas',url:origin+'/',logo:origin+'/assets/favicon.svg'},
    {'@type':'WebSite','@id':origin+'/#website',name:'KuboVistas',url:origin+'/',publisher:{'@id':origin+'/#organization'}},
    {'@type':'WebPage','@id':origin+page.path+'#webpage',name:page.title,description:page.description,url:origin+page.path,isPartOf:{'@id':origin+'/#website'}}
  ];
  if(page.type)graph.push({'@type':page.type,name:page.heading,description:page.copy,url:origin+page.path,...(page.type==='Article'?{author:{'@id':origin+'/#organization'},publisher:{'@id':origin+'/#organization'}}:{})});
  if(page.path!=='/')graph.push({'@type':'BreadcrumbList',itemListElement:page.path.split('/').filter(Boolean).map((name,index,parts)=>({'@type':'ListItem',position:index+1,name:name.replaceAll('-',' '),item:origin+'/'+parts.slice(0,index+1).join('/')}))});
  return JSON.stringify({'@context':'https://schema.org','@graph':graph}).replaceAll('<','\\u003c');
}

function renderHtml(template,page) {
  const canonical=origin+page.path;
  const robots=page.index?'index, follow, max-image-preview:large':'noindex, nofollow, noarchive';
  const metadata=`\n  <link rel="canonical" href="${canonical}">\n  <meta name="robots" content="${robots}">\n  <meta property="og:type" content="${page.type==='Article'?'article':'website'}">\n  <meta property="og:site_name" content="KuboVistas">\n  <meta property="og:title" content="${esc(page.title)}">\n  <meta property="og:description" content="${esc(page.description)}">\n  <meta property="og:url" content="${canonical}">\n  <meta property="og:image" content="${origin}/assets/himalaya.jpg">\n  <meta name="twitter:card" content="summary_large_image">\n  <script type="application/ld+json">${jsonLd(page)}</script>`;
  const content=`<section class="page-intro wrap seo-entry"><span class="eyebrow green">KUBOVISTAS TRAVEL GUIDE</span><h1>${esc(page.heading)}</h1><p>${esc(page.copy)}</p>${page.keywords?.length?`<ul>${page.keywords.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</section>`;
  return template
    .replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${esc(page.description)}">${metadata}`)
    .replace(/<title>[^<]*<\/title>/,`<title>${esc(page.title)}</title>`)
    .replace('<main id="main" tabindex="-1"></main>',`<main id="main" tabindex="-1">${content}</main>`);
}

export async function buildSeo(output,template) {
  const pages=[...publicSeoRoutes,...privateSeoRoutes];
  for(const page of pages){
    const dir=new URL('.'+(page.path==='/'?'/':page.path+'/'),output);
    await mkdir(dir,{recursive:true});
    await writeFile(new URL('index.html',dir),renderHtml(template,page));
  }
  const today=new Date().toISOString().slice(0,10);
  const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicSeoRoutes.map(page=>`  <url><loc>${origin}${page.path}</loc><lastmod>${today}</lastmod><changefreq>${page.path.startsWith('/destinations/')?'monthly':'weekly'}</changefreq></url>`).join('\n')}\n</urlset>\n`;
  await writeFile(new URL('sitemap.xml',output),sitemap);
  await writeFile(new URL('robots.txt',output),`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account/\nDisallow: /journal/write\nDisallow: /journal/my-stories\nDisallow: /journal/journal-review\nSitemap: ${origin}/sitemap.xml\n`);
}
