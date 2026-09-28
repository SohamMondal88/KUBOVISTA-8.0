// Illustrative planning concepts, not inventory, guaranteed departures, or prices.
export const packages = [
 {id:'darjeeling-tea-trails',name:'Darjeeling & Tea Trails',region:'North Bengal',days:5,stops:['darjeeling','lamahatta','kalimpong'],theme:'Hills & heritage',intro:'Tea country, town walks and an unhurried Kalimpong finish.'},
 {id:'kalimpong-quiet-villages',name:'Kalimpong Village Retreat',region:'North Bengal',days:4,stops:['kalimpong','pabong','ramdhura'],theme:'Village stays',intro:'A quieter hill base and time to explore nearby communities.'},
 {id:'sittong-orange-trail',name:'Sittong & Mirik Slow Days',region:'North Bengal',days:5,stops:['sittong','mirik','kurseong'],theme:'Scenic journeys',intro:'A flexible route through village landscapes and tea country.'},
 {id:'darjeeling-forest-pause',name:'Darjeeling Forest Pause',region:'North Bengal',days:4,stops:['darjeeling','lepchajagat','chatakpur'],theme:'Nature & walks',intro:'Forest-side stays with gentle walks subject to local conditions.'},
 {id:'sikkim-cultural-circuit',name:'Sikkim Cultural Circuit',region:'Sikkim',days:6,stops:['east-sikkim','south-sikkim','pelling'],theme:'Culture & views',intro:'Slow transfers and time for local heritage across Sikkim.'},
 {id:'north-sikkim-exploration',name:'North Sikkim Exploration',region:'Sikkim',days:5,stops:['north-sikkim','east-sikkim'],theme:'Mountain access',intro:'A route planned only after permits, road and weather checks.'},
 {id:'pelling-river-retreat',name:'Pelling & Rishikhola Retreat',region:'Sikkim & North Bengal',days:5,stops:['pelling','rishikhola'],theme:'Slow travel',intro:'A small number of bases and room for changes in travel conditions.'},
 {id:'arunachal-highlands',name:'Arunachal Highlands',region:'Arunachal Pradesh',days:7,stops:['arunachal-pradesh'],theme:'Highland journey',intro:'An adaptable route subject to current permits and access.'},
 {id:'goa-heritage-coast',name:'Goa Heritage & Coast',region:'Goa',days:5,stops:['goa'],theme:'Coast & culture',intro:'A calm coastal base with optional heritage outings.'},
 {id:'bengal-coast-reset',name:'Bengal Coast Reset',region:'West Bengal',days:4,stops:['bakkhali','henry-island'],theme:'Coastal pause',intro:'A short coastal break with local conditions confirmed before booking.'}
];
export const packageById=id=>packages.find(p=>p.id===id);
