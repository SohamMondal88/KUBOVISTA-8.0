import { destinations } from '../data.js';
import { metadata, indiaDate } from '../destination-meta.js';
const cache=new Map();
export function dateOffset(date,today=indiaDate()) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)return null;
 return Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
}
export async function weatherFor(id,date,fetcher=fetch){
 const d=destinations.find(x=>x.id===id);if(!d)return {status:404,error:'Destination not found.'};
 const point=metadata(d);if(point.unconfirmed||!Number.isFinite(point.lat)||!Number.isFinite(point.lng))return {status:422,error:'The exact locality needs confirmation before a reliable weather lookup.'};
 const selected=date||indiaDate(),offset=dateOffset(selected);if(offset===null)return {status:400,error:'Choose a valid travel date.'};
 const key=process.env.OPEN_METEO_API_KEY;
 if(!key&&process.env.WEATHER_DEMO!=='true')return {status:503,error:'Live weather is not activated yet. Check the linked official weather service before travel.'};
 let data=cache.get(id);
 if(!data||Date.now()-data.fetched>15*60*1000){
  const url=new URL(key?'https://customer-api.open-meteo.com/v1/forecast':'https://api.open-meteo.com/v1/forecast');
  Object.entries({latitude:point.lat,longitude:point.lng,current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code,wind_speed_10m_max',timezone:'Asia/Kolkata',forecast_days:16,...(key?{apikey:key}:{})}).forEach(([k,v])=>url.searchParams.set(k,String(v)));
  const response=await fetcher(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Weather provider unavailable');
  const raw=await response.json();if(!raw.current||!Array.isArray(raw.daily?.time))throw new Error('Weather data incomplete');
  data={raw,fetched:Date.now()};cache.set(id,data);
 }
 const raw=data.raw,index=raw.daily.time.indexOf(selected);const daily=index>=0?Object.fromEntries(Object.entries(raw.daily).map(([k,v])=>[k,v[index]??null])):null;
 return {status:200,destination:d.name,reference:point.anchor||'Approximate town/village center; not a property forecast',latitude:point.lat,longitude:point.lng,current:raw.current,daily,selectedDate:selected,forecastAvailable:!!daily,notice:daily?'Forecast confidence decreases further ahead. Mountain microclimates may differ.':offset<0?'Past dates are outside this forecast view.':'This date is beyond the available forecast horizon. Check again within 16 days of departure.',fetchedAt:new Date(data.fetched).toISOString(),timezone:'Asia/Kolkata',provider:'Open-Meteo',source:'https://open-meteo.com/'};
}
