import { destinations } from '../data.js';
export const travelStyles = ['solo','couples','friends','family','students'];
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const ids = new Set(destinations.map(d=>d.id));
export function publicText(value, min, max) {
 if(typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw Error(`Use between ${min} and ${max} characters.`);
 const text=value.trim();
 if(/https?:|www\.|@|\+?\d[\d\s().-]{7,}\d/i.test(text)) throw Error('Keep contact details, links and phone numbers out of companion posts and requests.');
 return text;
}
function day(value) {
 if(typeof value !== 'string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Choose valid travel dates.');
 const date=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==value) throw Error('Choose valid travel dates.');
 return date;
}
export function validateTrip(body, now=new Date()) {
 if(body.adult!==true||body.guidelines!==true) throw Error('Confirm that you are 18 or older and accept the companion guidelines.');
 if(!ids.has(body.destination)) throw Error('Choose a destination from our collection.');
 if(!travelStyles.includes(body.style)) throw Error('Choose a travel style.');
 const start=day(body.start_date),end=day(body.end_date),today=new Date(now.toISOString().slice(0,10)+'T00:00:00Z');
 if(start<today||end<start||end-start>30*86400000||start-today>366*86400000) throw Error('Choose a future trip within one year, lasting no more than 31 days.');
 const budget=Number(body.budget),seats=Number(body.seats);
 if(!Number.isInteger(budget)||budget<500||budget>500000) throw Error('Budget must be between ₹500 and ₹5,00,000 per person.');
 if(!Number.isInteger(seats)||seats<1||seats>8) throw Error('Choose between 1 and 8 companion places.');
 return {destination:body.destination,style:body.style,start_date:body.start_date,end_date:body.end_date,budget,seats,title:publicText(body.title,8,90),description:publicText(body.description,30,700),display_name:publicText(body.display_name,2,35)};
}
export function validateJoin(body) {
 if(body.adult!==true||body.guidelines!==true) throw Error('Companion requests require confirmation that you are 18 or older and accept the guidelines.');
 return {message:publicText(body.message,15,400),display_name:publicText(body.display_name,2,35)};
}
