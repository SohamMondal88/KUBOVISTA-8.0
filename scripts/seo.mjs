import { mkdir, writeFile } from 'node:fs/promises';
import { destinations, notes } from '../data.js';
import { packages } from '../packages.js';
import { legalPages, legalOrder } from '../legal.js';

const origin = 'https://kubovista.com';
const siteUpdated = '2026-09-27';
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const route = (path,title,description,heading,copy=description,extra={}) => ({path,title,description,heading,copy,index:true,lastmod:siteUpdated,...extra});

export const publicSeoRoutes = [
  route('/','KuboVistas | Thoughtful India Travel Guides & Tours','Explore thoughtful India travel guides, slow journeys and trip-planning ideas across North Bengal, Sikkim, Arunachal Pradesh, Goa and coastal Bengal.','Thoughtful India travel, at your pace.'),
  route('/destinations','India Travel Destinations & Tour Guides | KuboVistas','Browse 28 destination guides across the Himalayas, North Bengal, Sikkim, Arunachal Pradesh, Goa and coastal Bengal.','Explore travel destinations across India.'),
  ...destinations.map(d=>route(`/destinations/${d.id}`,`${d.name} Travel Guide & Tour Ideas | KuboVistas`,`${d.description} Suggested stay: ${d.duration}.`,`${d.name} travel guide`,d.tagline,{type:'TouristDestination',keywords:[d.region,d.type,...d.highlights]})),
  route('/journeys','India Tour Itineraries & Slow Journeys | KuboVistas','Explore flexible India tour itineraries for Himalayan hills, Sikkim and Goa, designed with realistic travel time and room to wander.','Flexible India tour itineraries.'),
  route('/packages','Signature India Tour Packages | KuboVistas','Explore ten flexible India tour concepts with personal quotations and clear inclusions.','Signature trip ideas across India.'),
  ...packages.map(p=>route('/packages/'+p.id,p.name+' | KuboVistas',p.intro,p.name,p.intro)),
  route('/guides','India Travel Tips & Practical Guides | KuboVistas','Read practical India travel guides covering slow itineraries, mountain packing and respectful local travel.','Practical travel advice for India.'),
  ...notes.map(n=>route(`/guides/${n.id}`,`${n.title} | KuboVistas`,n.intro,n.title,n.body.join(' '),{type:'Article',article:n})),
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
  ...['login','signup','verify-email','forgot-password','reset-password','welcome','dashboard','profile','bookings','payments','notifications','settings','security','saved','admin','support','case','documents','document','team'].map(x=>`/account/${x}`)
].map(path=>route(path,'KuboVistas Account','Secure KuboVistas account and trip-planning page.','Your KuboVistas account.','Sign in to continue.',{index:false}));

function jsonLd(page) {
  const graph=[
    {'@type':'Organization','@id':origin+'/#organization',name:'KuboVistas',url:origin+'/',logo:origin+'/assets/favicon.svg'},
    {'@type':'WebSite','@id':origin+'/#website',name:'KuboVistas',url:origin+'/',publisher:{'@id':origin+'/#organization'}},
    {'@type':'WebPage','@id':origin+page.path+'#webpage',name:page.title,description:page.description,url:origin+page.path,isPartOf:{'@id':origin+'/#website'}}
  ];
  if(page.type)graph.push({'@type':page.type,name:page.heading,description:page.copy,url:origin+page.path,...(page.type==='Article'?{headline:page.heading,author:{'@type':'Organization',name:'KuboVistas Editorial Team',url:origin+'/company/about'},publisher:{'@id':origin+'/#organization'},datePublished:page.article.published,dateModified:page.article.updated,wordCount:page.article.wordCount,articleSection:page.article.category,mainEntityOfPage:{'@id':origin+page.path+'#webpage'}}:{})});
  if(page.path!=='/')graph.push({'@type':'BreadcrumbList',itemListElement:page.path.split('/').filter(Boolean).map((name,index,parts)=>({'@type':'ListItem',position:index+1,name:name.replaceAll('-',' '),item:origin+'/'+parts.slice(0,index+1).join('/')}))});
  return JSON.stringify({'@context':'https://schema.org','@graph':graph}).replaceAll('<','\\u003c');
}

function renderHtml(template,page) {
  const canonical=origin+page.path;
  const robots=page.index?'index, follow, max-image-preview:large':'noindex, nofollow, noarchive';
  const metadata=`\n  <link rel="canonical" href="${canonical}">\n  <meta name="robots" content="${robots}">\n  <meta property="og:type" content="${page.type==='Article'?'article':'website'}">\n  <meta property="og:site_name" content="KuboVistas">\n  <meta property="og:title" content="${esc(page.title)}">\n  <meta property="og:description" content="${esc(page.description)}">\n  <meta property="og:url" content="${canonical}">\n  <meta property="og:image" content="${origin}/assets/himalaya.jpg">\n  <meta name="twitter:card" content="summary_large_image">\n  <script type="application/ld+json">${jsonLd(page)}</script>`;
  const article=page.article?`<article class="wrap article-body seo-article"><div class="article-meta"><span>By <a href="/company/about">KuboVistas Editorial Team</a></span><span>Published ${esc(page.article.published)}</span><span>Reviewed ${esc(page.article.updated)}</span><span>${esc(page.article.time)} · ${page.article.wordCount} words</span></div>${page.article.sections.map((section,index)=>`<section class="article-section"><span>${String(index+1).padStart(2,'0')}</span><div><h2>${esc(section.heading)}</h2>${section.paragraphs.map(paragraph=>`<p>${esc(paragraph)}</p>`).join('')}</div></section>`).join('')}<aside class="article-sources"><h2>Official planning resources</h2><ul>${page.article.sources.map(source=>`<li><a href="${esc(source.href)}" rel="noopener noreferrer">${esc(source.label)}</a></li>`).join('')}</ul></aside></article>`:'';
  const content=`<section class="page-intro wrap seo-entry"><span class="eyebrow green">KUBOVISTAS TRAVEL GUIDE</span><h1>${esc(page.heading)}</h1><p>${esc(page.article?.intro||page.copy)}</p>${page.keywords?.length?`<ul>${page.keywords.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</section>${article}`;
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
  const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicSeoRoutes.map(page=>`  <url><loc>${origin}${page.path}</loc><lastmod>${page.article?.updated||page.lastmod}</lastmod><changefreq>${page.path.startsWith('/destinations/')?'monthly':'weekly'}</changefreq></url>`).join('\n')}\n</urlset>\n`;
  await writeFile(new URL('sitemap.xml',output),sitemap);
  await writeFile(new URL('robots.txt',output),`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account/\nDisallow: /journal/write\nDisallow: /journal/my-stories\nDisallow: /journal/journal-review\nSitemap: ${origin}/sitemap.xml\n`);
}
