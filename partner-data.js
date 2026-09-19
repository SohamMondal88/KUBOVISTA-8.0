// Publish only properties with confirmed partnership and permission to list.
// {id,name,type:'Hotel'|'Homestay'|'Hostel',destination,description,website,verified:true}
export const partnerStays=[];
// Add only actual vacancies: {id,title,location,type,description}.
export const careerOpenings=[];
export const campingKits=[
 {id:'day-trek',name:'The day-trail kit',tag:'DAY TREKKING',description:'A practical checklist for a guided day walk on a permitted route.',items:['20–30 L daypack','Broken-in trail shoes and spare socks','Rain shell and sun protection','Reusable water bottles and trail snacks','Headlamp, charged phone and offline route','Personal first-aid essentials and prescribed medication']},
 {id:'overnight',name:'The overnight camp kit',tag:'OVERNIGHT CAMPING',description:'Discuss the route, temperature and campsite rules with your guide before selecting equipment.',items:['Weather-appropriate tent and groundsheet','Sleeping bag rated for expected overnight temperatures','Insulated sleeping mat','Dry bags, warm layers and rain protection','Headlamp and backup power','Waste bags and permitted cooking arrangements']},
 {id:'trek-support',name:'The supported trek kit',tag:'MULTI-DAY TREKKING',description:'An equipment enquiry checklist; specialist or high-altitude trips need a qualified local guide.',items:['Fitted trekking backpack with rain cover','Layering system and gloves appropriate to altitude','Trekking poles where appropriate','Water-treatment plan agreed with your guide','Offline maps, emergency contacts and communication plan','Permits, insurance details and a route-specific packing review']}
];
