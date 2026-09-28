import {requireSession,isAdmin} from './auth.js';
import {databaseConfigured,query,transaction} from './db.js';
import {json,methodNotAllowed,parseBody,cleanText,publicError} from './http.js';
import {validateAffiliateOffers} from '../affiliates.js';
import {publicCatalog,searchCatalog,regions} from '../search-catalog.js';
const uuid=v=>typeof v==='string'&&/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(v);
const locales=['en','hi','bn'];
const owned=(session)=>session.user.id;
function validateArticle(body){
 const slug=cleanText(body.slug,80).toLowerCase(),locale=body.locale, title=cleanText(body.title,150),summary=cleanText(body.summary,350);
 const text=typeof body.body==='string'?body.body.trim().slice(0,15000):'';
 const sponsor=cleanText(body.sponsorName,120),sponsored=body.sponsored===true;
 const region=cleanText(body.region,80);
 if(!/^[a-z0-9-]{3,80}$/.test(slug)||!locales.includes(locale)||title.length<5||summary.length<20||text.length<80||sponsored&&sponsor.length<2||region&&!regions.some(r=>r.name===region))return null;
 return {slug,locale,title,summary,body:text,region,sponsored,sponsor};
}
export default async function growth(req,res){
 if(!['GET','POST'].includes(req.method))return methodNotAllowed(res,['GET','POST']);
 const input=req.method==='GET'?req.query||{}:parseBody(req),action=input.action;
 try{
  if(req.method==='GET'){
   if(action==='search'){
    const items=publicCatalog();
    if(databaseConfigured())try{const rows=await query("SELECT slug,locale,title,summary,region,sponsored FROM editorial_pages WHERE status='published' AND locale=$1 ORDER BY published_at DESC LIMIT 100",[locales.includes(input.locale)?input.locale:'en']);for(const p of rows.rows)items.push({type:p.sponsored?'Sponsored article':'Editorial',title:p.title,summary:p.summary,region:p.region,path:`/stories/${p.slug}?lang=${p.locale}`});}catch{}
    return json(res,200,{results:searchCatalog(input.q,items)});
   }
   if(action==='articles'){
    const locale=locales.includes(input.locale)?input.locale:'en';
    if(!databaseConfigured())return json(res,200,{articles:[]});
    const rows=await query(`SELECT slug,locale,title,summary,body,region,sponsored,sponsor_name,published_at FROM editorial_pages WHERE status='published' AND locale=$1 ${input.slug?'AND slug=$2':''} ORDER BY published_at DESC LIMIT 100`,input.slug?[locale,cleanText(input.slug,80)]:[locale]);return json(res,200,{articles:rows.rows});
   }
   if(action==='affiliate_offers'){
    if(!databaseConfigured())return json(res,200,{offers:[]});const rows=await query("SELECT slug,provider,category,title,description,url FROM affiliate_placements WHERE status='active' ORDER BY created_at DESC LIMIT 30");return json(res,200,{offers:rows.rows});
   }
   if(action==='reviews'){
    if(!databaseConfigured())return json(res,200,{reviews:[]});
    const rows=await query(`SELECT r.id,r.rating,r.title,r.body,r.published_at,b.destination_name FROM traveler_reviews r JOIN bookings b ON b.id=r.booking_id WHERE r.status='published' ORDER BY r.published_at DESC LIMIT 30`);return json(res,200,{reviews:rows.rows});
   }
  }
  const session=await requireSession(req,res);if(!session)return;
  const admin=isAdmin(session),user=owned(session);
  if(req.method==='GET'){
   if(action==='my_reviews'){const rows=await query('SELECT id,booking_id,rating,title,body,status,created_at FROM traveler_reviews WHERE user_id=$1 ORDER BY created_at DESC',[user]);return json(res,200,{reviews:rows.rows});}
   if(action==='review_queue'||action==='editorial_drafts'||action==='affiliate_queue'){
    if(!admin)return json(res,403,{error:'Administrator access required.'});
    const rows=action==='review_queue'?await query("SELECT r.*,b.destination_name FROM traveler_reviews r JOIN bookings b ON b.id=r.booking_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 100"):action==='affiliate_queue'?await query("SELECT id,slug,provider,category,title,description,url,status,approval_reference FROM affiliate_placements ORDER BY created_at DESC LIMIT 100"):await query("SELECT * FROM editorial_pages ORDER BY updated_at DESC LIMIT 100");return json(res,200,{items:rows.rows});
   }
   if(action==='supplier_bookings'){
    const rows=await query(`SELECT s.id AS supplier_id,s.name AS supplier_name,b.id AS booking_id,b.destination_name,b.departure_date,b.travelers,bs.confirmation_reference,bs.confirmed_at,bs.supplier_response
     FROM supplier_accounts sa JOIN suppliers s ON s.id=sa.supplier_id JOIN booking_suppliers bs ON bs.supplier_id=s.id JOIN bookings b ON b.id=bs.booking_id
     WHERE sa.user_id=$1 AND s.status='approved' AND b.status!='cancelled' ORDER BY b.departure_date DESC LIMIT 100`,[user]);return json(res,200,{assignments:rows.rows});
   }
   if(action==='membership'){const rows=await query('SELECT plan,created_at FROM membership_interests WHERE user_id=$1',[user]);return json(res,200,{interests:rows.rows});}
   return json(res,404,{error:'Unknown growth resource.'});
  }
  if(action==='article_save'){
   if(!admin)return json(res,403,{error:'Administrator access required.'});const article=validateArticle(input);if(!article)return json(res,400,{error:'Provide a valid locale, slug, title, summary, article and sponsorship details.'});
   const result=await transaction(async client=>{
    const row=(await client.query(`INSERT INTO editorial_pages(slug,locale,title,summary,body,region,sponsored,sponsor_name,author_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(slug,locale) DO UPDATE SET title=$3,summary=$4,body=$5,region=$6,sponsored=$7,sponsor_name=$8,status='draft',published_at=NULL,updated_at=now() RETURNING id`,[article.slug,article.locale,article.title,article.summary,article.body,article.region||null,article.sponsored,article.sponsored?article.sponsor:null,user])).rows[0];
    await client.query("INSERT INTO audit_logs(actor_id,action,subject_type,subject_id) VALUES($1,'editorial.saved','article',$2)",[user,row.id]);return row;
   });return json(res,200,{article:result});
  }
  if(action==='article_status'){
   if(!admin||!uuid(input.id)||!['published','archived'].includes(input.status))return json(res,403,{error:'Administrator and valid article status required.'});
   const result=await transaction(async client=>{
    const row=(await client.query(`UPDATE editorial_pages SET status=$2,reviewed_by=$3,published_at=CASE WHEN $2='published' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1 RETURNING id`,[input.id,input.status,user])).rows[0];
    if(row)await client.query("INSERT INTO audit_logs(actor_id,action,subject_type,subject_id,details) VALUES($1,'editorial.status','article',$2,$3)",[user,row.id,JSON.stringify({status:input.status})]);return row;
   });return json(res,result?200:404,result?{article:result}:{error:'Article not found.'});
  }
  if(action==='review_submit'){
   if(input.consent!==true||!uuid(input.bookingId)||!Number.isInteger(input.rating)||input.rating<1||input.rating>5||cleanText(input.title,100).length<5||cleanText(input.body,3000).length<40)return json(res,400,{error:'Provide a completed booking, rating, title and detailed review.'});
   const result=await transaction(async client=>{
    const b=(await client.query("SELECT id FROM bookings WHERE id=$1 AND user_id=$2 AND (status='completed' OR checked_in_at IS NOT NULL) FOR UPDATE",[input.bookingId,user])).rows[0];if(!b)return null;
    const row=(await client.query('INSERT INTO traveler_reviews(booking_id,user_id,rating,title,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(booking_id) DO NOTHING RETURNING id',[b.id,user,input.rating,cleanText(input.title,100),cleanText(input.body,3000)])).rows[0];return row;
   });return json(res,result?201:409,result?{review:result}:{error:'Only one review per completed or checked-in booking is allowed.'});
  }
  if(action==='review_moderate'){
   if(!admin||!uuid(input.id)||!['published','rejected'].includes(input.status))return json(res,403,{error:'Administrator and valid moderation action required.'});
   const result=await transaction(async client=>{
    const row=(await client.query("UPDATE traveler_reviews SET status=$2,moderated_by=$3,moderation_note=$4,published_at=CASE WHEN $2='published' THEN now() ELSE NULL END WHERE id=$1 AND status='pending' RETURNING id",[input.id,input.status,user,cleanText(input.note,500)])).rows[0];
    if(row)await client.query("INSERT INTO audit_logs(actor_id,action,subject_type,subject_id,details) VALUES($1,'review.moderated','review',$2,$3)",[user,row.id,JSON.stringify({status:input.status})]);return row;
   });return json(res,result?200:404,result?{review:result}:{error:'Pending review not found.'});
  }
  if(action==='supplier_response'){
   if(!uuid(input.supplierId)||!uuid(input.bookingId)||!['accepted','declined'].includes(input.response))return json(res,400,{error:'Choose an assignment and response.'});
   const result=await transaction(async client=>{
    const row=(await client.query(`UPDATE booking_suppliers bs SET supplier_response=$3,supplier_response_at=now()
     WHERE bs.supplier_id=$1 AND bs.booking_id=$2 AND bs.supplier_response='pending'
     AND EXISTS(SELECT 1 FROM supplier_accounts sa JOIN suppliers s ON s.id=sa.supplier_id WHERE sa.supplier_id=bs.supplier_id AND sa.user_id=$4 AND s.status='approved')
     RETURNING bs.booking_id,bs.supplier_id`,[input.supplierId,input.bookingId,input.response,user])).rows[0];
    if(row)await client.query("INSERT INTO audit_logs(actor_id,action,subject_type,subject_id,details) VALUES($1,'supplier.responded','booking',$2,$3)",[user,row.booking_id,JSON.stringify({supplierId:row.supplier_id,response:input.response})]);return row;
   });return json(res,result?200:409,result?{assignment:result}:{error:'Assignment is unavailable or already answered.'});
  }
  if(action==='supplier_grant'){
   if(!admin||!uuid(input.supplierId)||typeof input.email!=='string')return json(res,403,{error:'Administrator and approved supplier required.'});
   const result=await transaction(async client=>{
    const row=(await client.query(`INSERT INTO supplier_accounts(supplier_id,user_id,created_by)
     SELECT s.id,u.id,$3 FROM suppliers s CROSS JOIN "user" u WHERE s.id=$1 AND s.status='approved' AND lower(u.email)=lower($2) AND u."emailVerified"=true
     ON CONFLICT DO NOTHING RETURNING supplier_id,user_id`,[input.supplierId,input.email.trim(),user])).rows[0];
    if(row)await client.query("INSERT INTO audit_logs(actor_id,action,subject_type,subject_id) VALUES($1,'supplier.access_granted','supplier',$2)",[user,row.supplier_id]);return row;
   });return json(res,result?201:404,result?{access:result}:{error:'Approved supplier and verified account required, or access exists.'});
  }
  if(action==='affiliate_save'){
   if(!admin)return json(res,403,{error:'Administrator access required.'});
   let offer;try{offer=validateAffiliateOffers([{id:input.slug,provider:input.provider,category:input.category,title:input.title,description:input.description,url:input.url,placements:['journal'],approved:true}])[0];}catch(error){return json(res,400,{error:error.message});}
   const reference=cleanText(input.approvalReference,160);if(reference.length<8)return json(res,400,{error:'Record the affiliate programme approval reference before review.'});
   const row=(await query(`INSERT INTO affiliate_placements(slug,provider,category,title,description,url,approval_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(slug) DO UPDATE SET provider=$2,category=$3,title=$4,description=$5,url=$6,approval_reference=$7,status='review' RETURNING id`,[offer.id,offer.provider,offer.category,offer.title,offer.description,offer.url,reference,user])).rows[0];return json(res,200,{offer:row});
  }
  if(action==='affiliate_status'){
   if(!admin||!uuid(input.id)||!['active','paused'].includes(input.status))return json(res,403,{error:'Administrator and valid status required.'});
   const result=await transaction(async client=>{
    const row=(await client.query('UPDATE affiliate_placements SET status=$2,reviewed_by=$3 WHERE id=$1 RETURNING id',[input.id,input.status,user])).rows[0];
    if(row)await client.query("INSERT INTO audit_logs(actor_id,action,subject_type,subject_id,details) VALUES($1,'affiliate.status','offer',$2,$3)",[user,row.id,JSON.stringify({status:input.status})]);return row;
   });return json(res,result?200:404,result?{offer:result}:{error:'Offer not found.'});
  }
  if(action==='supplier_revoke'){
   if(!admin||!uuid(input.supplierId)||typeof input.email!=='string')return json(res,403,{error:'Administrator and supplier account required.'});
   const result=await transaction(async client=>{
    const row=(await client.query(`DELETE FROM supplier_accounts sa USING "user" u WHERE sa.user_id=u.id AND sa.supplier_id=$1 AND lower(u.email)=lower($2) RETURNING sa.supplier_id`,[input.supplierId,input.email.trim()])).rows[0];
    if(row)await client.query("INSERT INTO audit_logs(actor_id,action,subject_type,subject_id) VALUES($1,'supplier.access_revoked','supplier',$2)",[user,row.supplier_id]);return row;
   });return json(res,result?200:404,result?{revoked:true}:{error:'Supplier account access not found.'});
  }
  if(action==='membership_interest'){
   if(!['plus','circle'].includes(input.plan))return json(res,400,{error:'Choose a proposed plan.'});
   await query('INSERT INTO membership_interests(user_id,plan) VALUES($1,$2) ON CONFLICT DO NOTHING',[user,input.plan]);return json(res,200,{registered:true,message:'Interest recorded; no plan or payment is active.'});
  }
  return json(res,404,{error:'Unknown growth action.'});
 }catch(error){const failure=publicError(error);return json(res,failure.status,{error:failure.message});}
}
