// Approximate town/region centers for trip planning, never property or trailhead pins.
export const destinationMeta = {
 'darjeeling':{lat:27.041,lng:88.267,tags:['Mountains','Famous places','Crowded']},
 'pelling':{lat:27.300,lng:88.233,tags:['Mountains','Famous places','Waterfalls']},
 'goa':{lat:15.491,lng:73.828,anchor:'Panaji regional reference',season:'coast',tags:['Beaches','Famous places','Crowded','Waterfalls']},
 'kalimpong':{lat:27.062,lng:88.475,tags:['Mountains','Famous places']},
 'pabong':{lat:27.020,lng:88.570,tags:['Mountains','Offbeat']},
 'lebong':{lat:27.063,lng:88.277,tags:['Mountains','Offbeat']},
 'ramdhura':{lat:27.110,lng:88.580,tags:['Mountains','Offbeat']},
 'mirik':{lat:26.887,lng:88.188,tags:['Mountains','Lakes','Famous places']},
 'lamahatta':{lat:27.042,lng:88.383,tags:['Mountains','Forest','Offbeat']},
 'lepchajagat':{lat:26.989,lng:88.240,tags:['Mountains','Forest','Offbeat']},
 'chatakpur':{lat:26.963,lng:88.315,tags:['Mountains','Forest','Offbeat']},
 'samsu':{lat:27.062,lng:88.475,unconfirmed:true,anchor:'Kalimpong area only; exact locality unconfirmed',tags:['Offbeat']},
 'sittong':{lat:26.936,lng:88.368,tags:['Mountains','Offbeat']},
 'bijanbari':{lat:27.075,lng:88.146,tags:['Offbeat','Riverside']},
 'ahaldhara':{lat:26.951,lng:88.379,tags:['Mountains','Offbeat']},
 'kolbong':{lat:27.041,lng:88.267,unconfirmed:true,anchor:'Darjeeling area only; exact locality unconfirmed',tags:['Offbeat']},
 'kolakham':{lat:27.102,lng:88.668,tags:['Mountains','Forest','Offbeat','Waterfalls']},
 'peshok':{lat:27.065,lng:88.425,tags:['Mountains','Offbeat']},
 'rishikhola':{lat:27.177,lng:88.637,tags:['Riverside','Offbeat']},
 'arunachal-pradesh':{lat:27.084,lng:93.605,anchor:'Itanagar regional reference',tags:['Mountains','Offbeat']},
 'bakkhali':{lat:21.563,lng:88.259,season:'coast',tags:['Beaches']},
 'henry-island':{lat:21.572,lng:88.290,season:'coast',tags:['Beaches','Offbeat']},
 'belpahari':{lat:22.635,lng:86.783,season:'plains',tags:['Forest','Offbeat','Waterfalls']},
 'north-sikkim':{lat:27.504,lng:88.532,season:'highland',anchor:'Mangan regional reference; not a high-pass forecast',tags:['Mountains','Famous places']},
 'south-sikkim':{lat:27.167,lng:88.363,anchor:'Namchi regional reference',tags:['Mountains','Famous places']},
 'east-sikkim':{lat:27.331,lng:88.613,anchor:'Gangtok regional reference',tags:['Mountains','Famous places','Crowded']},
 'west-sikkim':{lat:27.289,lng:88.258,anchor:'Gyalshing regional reference',tags:['Mountains','Offbeat','Waterfalls']},
 'kurseong':{lat:26.882,lng:88.278,tags:['Mountains','Famous places']}
};
export const experienceTypes=['All','Beaches','Mountains','Offbeat','Crowded','Famous places','Waterfalls','Forest','Riverside','Lakes'];
export const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
export const indiaDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function metadata(d){return {...(destinationMeta[d.id]||{}),...(d.location||{}),tags:d.tags||destinationMeta[d.id]?.tags||[d.type]};}
export function seasonalStatus(d,month){
 const meta=metadata(d);const m=Number(month);
 if(!Number.isInteger(m)||m<1||m>12||meta.unconfirmed||(!destinationMeta[d.id]&&!d.location?.season))return {color:'yellow',label:'Needs local review',reason:'Seasonal guidance or the exact locality needs verification.'};
 const kind=meta.season||'hills';
 const good=kind==='coast'?[11,12,1,2]:kind==='plains'?[11,12,1,2]:kind==='highland'?[4,5,10]:[3,4,5,10,11];
 const caution=kind==='plains'?[4,5,6]:kind==='highland'?[1,2,6,7,8]:[6,7,8];
 if(good.includes(m))return {color:'green',label:'Generally favorable',reason:'Typically a comfortable season for this regional trip style. Confirm local conditions.'};
 if(caution.includes(m))return {color:'red',label:'Higher seasonal caution',reason:kind==='plains'?'Heat or seasonal rain can make outdoor outings difficult.':kind==='highland'&&[1,2].includes(m)?'Winter snow and access restrictions can limit high-country travel.':'Monsoon rain can disrupt outdoor activities and road access.'};
 return {color:'yellow',label:'Mixed / shoulder season',reason:'Changing rain, temperatures or access make flexible plans advisable.'};
}
export function matchesExperience(d,type){return !type||type==='All'||d.type===type||metadata(d).tags.includes(type)||(type==='Coast'&&metadata(d).tags.includes('Beaches'));}
