import {socialLinks} from './social-links.js';
import tripActions from './trip-actions.js';
import { weatherFor } from './weather.js';
import { databaseConfigured, query, transaction } from './db.js';
import { requireSession, isAdmin } from './auth.js';
import { json, parseBody, cleanText, methodNotAllowed } from './http.js';
const kinds=['contact','career','sponsor','partnership','stay','equipment'];
export default async function services(req,res){
 const service=req.query?.service;
 if(service==='social-links'){if(req.method!=='GET')return methodNotAllowed(res,['GET']);return json(res,200,{links:socialLinks()});}
 if(service==='trip-actions')return tripActions(req,res);
 if(service==='weather'){
  if(req.method!=='GET')return methodNotAllowed(res,['GET']);
  try{const result=await weatherFor(req.query.destination,req.query.date);return json(res,result.status,result);}catch{return json(res,502,{error:'Weather updates could not be retrieved. Please retry later.'});}
 }
 if(service==='contact-info'){
  if(req.method!=='GET')return methodNotAllowed(res,['GET']);
  return json(res,200,{enquiries:databaseConfigured()&&process.env.ENQUIRIES_ENABLED==='true',email:process.env.PUBLIC_CONTACT_EMAIL||null,phone:process.env.PUBLIC_CONTACT_PHONE||null,address:process.env.PUBLIC_BUSINESS_ADDRESS||null});
 }
 if(service!=='enquiries')return json(res,404,{error:'Service not found.'});
 try{
  if(req.method==='GET'||req.method==='PATCH'){
   const session=await requireSession(req,res);if(!session)return;
   if(!isAdmin(session))return json(res,403,{error:'Administrator access required.'});
   if(req.method==='GET'){const result=await query('SELECT * FROM business_enquiries ORDER BY created_at DESC LIMIT 100');return json(res,200,{enquiries:result.rows});}
   const b=parseBody(req);if(!/^[0-9a-f-]{36}$/i.test(b.id||''))return json(res,400,{error:'Invalid enquiry reference.'});
   const result=await query("UPDATE business_enquiries SET status='reviewed' WHERE id=$1 RETURNING id",[b.id]);return json(res,result.rowCount?200:404,{updated:!!result.rowCount});
  }
  if(req.method!=='POST')return methodNotAllowed(res,['GET','POST','PATCH']);
  if(!databaseConfigured()||process.env.ENQUIRIES_ENABLED!=='true')return json(res,503,{error:'The enquiry form is not activated. Please use the listed company contact channel.'});
  let origin;try{origin=new URL(process.env.BETTER_AUTH_URL).origin;}catch{return json(res,503,{error:'Enquiries are not configured.'});}
  if(req.headers.origin!==origin)return json(res,403,{error:'Request origin is not allowed.'});
  const b=parseBody(req);if(b.website)return json(res,400,{error:'Unable to accept this submission.'});
  const name=cleanText(b.name,120),email=cleanText(b.email,254).toLowerCase(),message=cleanText(b.message,5000),organization=cleanText(b.organization,180);
  if(!kinds.includes(b.kind)||name.length<2||!/^\S+@\S+\.\S+$/.test(email)||message.length<20||b.consent!==true)return json(res,400,{error:'Add your name, a valid email, a message of at least 20 characters and consent.'});
  const saved=await transaction(async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[email]);
   const count=await client.query("SELECT count(*) FROM business_enquiries WHERE email=$1 AND created_at>now()-interval '1 day'",[email]);
   if(Number(count.rows[0].count)>=3)return null;
   const result=await client.query('INSERT INTO business_enquiries(kind,name,email,organization,message) VALUES($1,$2,$3,$4,$5) RETURNING id',[b.kind,name,email,organization,message]);return result.rows[0];
  });
  return saved?json(res,201,{reference:saved.id}):json(res,429,{error:'You have reached the daily enquiry limit. Please try tomorrow.'});
 }catch{return json(res,503,{error:'We could not save your enquiry. Please try again later.'});}
}
