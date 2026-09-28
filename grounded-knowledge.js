import {destinations,notes} from './data.js';
import {packages} from './packages.js';
import {bookingFacts} from './kubo-knowledge.js';
export function groundedKnowledge(question,articles=[]){
 const terms=String(question||'').toLocaleLowerCase().split(/[^\p{L}\p{N}-]+/u).filter(x=>x.length>2).slice(0,20);
 const all=[
  ...destinations.map(d=>({title:d.name,url:`/destinations/${d.id}`,text:`${d.name}, ${d.region}. ${d.description} Suggested duration: ${d.duration}. No live price or availability.`})),
  ...packages.map(p=>({title:p.name,url:`/packages/${p.id}`,text:`${p.name}, ${p.region}. ${p.intro} ${p.days} suggested days. Personal quotation required.`})),
  ...notes.map(n=>({title:n.title,url:`/guides/${n.id}`,text:`${n.title}. ${n.intro}`})),
  ...articles.filter(a=>a.status==='published'&&!a.sponsored&&a.locale==='en').map(a=>({title:a.title,url:`/stories/${a.slug}`,text:`${a.title}. ${a.summary}`}))
 ];
 const scored=all.map(item=>({item,score:terms.filter(w=>`${item.title} ${item.text}`.toLocaleLowerCase().includes(w)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,5).map(x=>x.item);
 const facts=[{title:'Bookings and payments',url:'/legal/cancellation',text:bookingFacts},...scored];
 return {facts,links:facts.map(x=>({label:x.title,href:x.url}))};
}
