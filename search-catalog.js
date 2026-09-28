import {destinations,notes} from './data.js';
import {packages} from './packages.js';
export const regions=[
 {id:'north-bengal',name:'North Bengal',match:['North Bengal'],intro:'Tea country, hill towns and village routes with time to slow down.'},
 {id:'sikkim',name:'Sikkim',match:['Sikkim'],intro:'Mountain scenery and cultural routes, subject to access and permits.'},
 {id:'arunachal',name:'Arunachal',match:['Arunachal'],intro:'Highland journeys planned around current local access and permits.'},
 {id:'goa',name:'Goa',match:['Goa'],intro:'Coastal bases with room for heritage, food and rest.'},
 {id:'coastal-bengal',name:'Coastal Bengal',match:['Coastal Bengal'],intro:'Short coastal pauses shaped by seasonal conditions.'},
 {id:'western-bengal',name:'Western Bengal',match:['Western Bengal'],intro:'Forests and inland landscapes at an unhurried pace.'}
];
export const regionById=id=>regions.find(r=>r.id===id);
export function publicCatalog(){return [
 ...destinations.map(d=>({type:'Destination',title:d.name,summary:d.tagline,region:d.region,path:'/destinations/'+d.id})),
 ...packages.map(p=>({type:'Package concept',title:p.name,summary:p.intro,region:p.region,path:'/packages/'+p.id})),
 ...notes.map(n=>({type:'Guide',title:n.title,summary:n.intro,region:'',path:'/guides/'+n.id}))
];}
export function searchCatalog(term,items=publicCatalog()){
 const q=String(term||'').normalize('NFKC').trim().toLocaleLowerCase().slice(0,100);
 if(q.length<2)return [];
 const words=q.split(/\s+/).filter(Boolean);
 return items.filter(item=>words.every(word=>`${item.title} ${item.summary} ${item.region}`.toLocaleLowerCase().includes(word))).slice(0,30);
}
