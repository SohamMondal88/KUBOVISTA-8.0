import { requireSession, isAdmin, authConfigured } from '../server/auth.js';
import { databaseConfigured, query, transaction } from '../server/db.js';
import { json, methodNotAllowed, parseBody, publicError } from '../server/http.js';
import { uuid, validateTrip, validateJoin } from '../server/travel-date.js';
const fields='t.id,t.display_name,t.destination,t.style,t.title,t.description,t.start_date::text,t.end_date::text,t.budget,t.seats,t.status';
const blocked=`EXISTS(SELECT 1 FROM travel_date_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=t.user_id) OR (b.blocked_id=$1 AND b.blocker_id=t.user_id))`;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function createTravelDateHandler(deps={}) {
 const d={requireSession,isAdmin,authConfigured,databaseConfigured,query,transaction,enabled:()=>process.env.TRAVEL_DATE_ENABLED==='true',...deps};
 return async function handler(req,res){
  if(!['GET','POST','PATCH'].includes(req.method))return methodNotAllowed(res,['GET','POST','PATCH']);
  try {
   if(!d.enabled()||!d.databaseConfigured()||!d.authConfigured())return json(res,req.method==='GET'?200:503,{available:false,trips:[],error:req.method==='GET'?undefined:'Companion matching is not open yet.'});
   // Reading real companion plans also requires a verified account.
   const session=await d.requireSession(req,res);if(!session)return;
   if(session.user.emailVerified!==true)return json(res,403,{error:'Verify your email before using Travel Date.'});
   const uid=session.user.id,admin=d.isAdmin(session),view=req.query?.view||'browse';
   if(req.method==='GET'){
    if(view==='review'){
     if(!admin)return json(res,403,{error:'Administrator access required.'});
     const trips=await d.query(`SELECT ${fields} FROM travel_date_trips t WHERE t.status='pending' ORDER BY t.created_at LIMIT 100`);
     const reports=await d.query(`SELECT r.id,r.reason,r.trip_id,t.title,t.description,t.display_name,t.status AS trip_status FROM travel_date_reports r JOIN travel_date_trips t ON t.id=r.trip_id WHERE r.status='open' ORDER BY r.created_at LIMIT 100`);
     const introductions=await d.query(`SELECT r.id,r.trip_id,t.title,t.display_name AS organiser,r.display_name AS traveller,owner.email AS organiser_email,member.email AS traveller_email FROM travel_date_requests r JOIN travel_date_trips t ON t.id=r.trip_id JOIN "user" owner ON owner.id=t.user_id JOIN "user" member ON member.id=r.user_id WHERE r.status='accepted' AND t.status='published' AND t.end_date>=CURRENT_DATE ORDER BY r.updated_at DESC LIMIT 100`);
     return json(res,200,{available:true,admin,trips:trips.rows,reports:reports.rows,introductions:introductions.rows});
    }
    if(view==='mine'){
     const trips=await d.query(`SELECT ${fields} FROM travel_date_trips t WHERE t.user_id=$1 ORDER BY t.created_at DESC LIMIT 100`,[uid]);
     const incoming=await d.query(`SELECT r.id,r.trip_id,r.display_name,r.message,r.status,t.title FROM travel_date_requests r JOIN travel_date_trips t ON t.id=r.trip_id WHERE t.user_id=$1 AND NOT EXISTS(SELECT 1 FROM travel_date_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=r.user_id) OR (b.blocked_id=$1 AND b.blocker_id=r.user_id)) ORDER BY r.created_at DESC LIMIT 100`,[uid]);
     const outgoing=await d.query(`SELECT r.id,r.trip_id,r.status,t.title,t.status AS trip_status FROM travel_date_requests r JOIN travel_date_trips t ON t.id=r.trip_id WHERE r.user_id=$1 AND NOT ${blocked} ORDER BY r.created_at DESC LIMIT 100`,[uid]);
     return json(res,200,{available:true,admin,trips:trips.rows,incoming:incoming.rows,outgoing:outgoing.rows});
    }
    const trips=await d.query(`SELECT ${fields},(SELECT count(*)::int FROM travel_date_requests r WHERE r.trip_id=t.id AND r.status='accepted') AS accepted FROM travel_date_trips t WHERE t.status='published' AND t.start_date>=CURRENT_DATE AND t.user_id<>$1 AND NOT ${blocked} ORDER BY t.start_date LIMIT 100`,[uid]);
    return json(res,200,{available:true,admin,trips:trips.rows});
   }
   const body=parseBody(req),action=body.action;
   if(action==='create'&&req.method==='POST'){
    let trip;try{trip=validateTrip(body);}catch(e){return json(res,400,{error:e.message});}
    const result=await d.transaction(async c=>{
     await c.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[uid]);
     const count=await c.query("SELECT count(*)::int AS n FROM travel_date_trips WHERE user_id=$1 AND created_at>now()-interval '1 day'",[uid]);
     if(count.rows[0].n>=3)throw fail('You can submit three trips per day.',429);
     return (await c.query(`INSERT INTO travel_date_trips(user_id,display_name,destination,style,title,description,start_date,end_date,budget,seats) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,status`,[uid,trip.display_name,trip.destination,trip.style,trip.title,trip.description,trip.start_date,trip.end_date,trip.budget,trip.seats])).rows[0];
    });return json(res,201,{trip:result});
   }
   if(!uuid(body.id))return json(res,400,{error:'Invalid reference.'});
   if(action==='join'&&req.method==='POST'){
    let join;try{join=validateJoin(body);}catch(e){return json(res,400,{error:e.message});}
    await d.transaction(async c=>{
     await c.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[uid]);
     const count=await c.query("SELECT count(*)::int AS n FROM travel_date_requests WHERE user_id=$1 AND created_at>now()-interval '1 day'",[uid]);
     if(count.rows[0].n>=20)throw fail('Daily request limit reached.',429);
     const result=await c.query(`SELECT t.* FROM travel_date_trips t WHERE t.id=$2 AND t.user_id<>$1 AND t.status='published' AND t.start_date>=CURRENT_DATE AND NOT ${blocked} FOR UPDATE`,[uid,body.id]);
     if(!result.rowCount)throw fail('This trip is not accepting your request.',409);
     const seats=await c.query("SELECT count(*)::int AS n FROM travel_date_requests WHERE trip_id=$1 AND status='accepted'",[body.id]);
     if(seats.rows[0].n>=result.rows[0].seats)throw fail('This trip has no companion places remaining.',409);
     await c.query('INSERT INTO travel_date_requests(trip_id,user_id,display_name,message) VALUES($1,$2,$3,$4)',[body.id,uid,join.display_name,join.message]);
    });return json(res,201,{message:'Request sent. The organiser can accept or decline it.'});
   }
   if(action==='respond'&&req.method==='PATCH'){
    if(!['accepted','declined'].includes(body.status))throw fail('Choose accept or decline.');
    await d.transaction(async c=>{
     const lookup=await c.query('SELECT trip_id FROM travel_date_requests WHERE id=$1',[body.id]);if(!lookup.rowCount)throw fail('Request not found.',404);
     const trip=await c.query(`SELECT * FROM travel_date_trips WHERE id=$1 AND user_id=$2 AND status='published' AND start_date>=CURRENT_DATE FOR UPDATE`,[lookup.rows[0].trip_id,uid]);if(!trip.rowCount)throw fail('Only the organiser of an active trip can respond.',403);
     const request=await c.query(`SELECT r.* FROM travel_date_requests r WHERE r.id=$2 AND r.status='pending' AND NOT EXISTS(SELECT 1 FROM travel_date_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=r.user_id) OR (b.blocked_id=$1 AND b.blocker_id=r.user_id)) FOR UPDATE`,[uid,body.id]);if(!request.rowCount)throw fail('This request is no longer available.',409);
     if(body.status==='accepted'){
      const count=await c.query("SELECT count(*)::int AS n FROM travel_date_requests WHERE trip_id=$1 AND status='accepted'",[trip.rows[0].id]);if(count.rows[0].n>=trip.rows[0].seats)throw fail('No companion places remain.',409);
     }
     await c.query('UPDATE travel_date_requests SET status=$2,updated_at=now() WHERE id=$1',[body.id,body.status]);
    });return json(res,200,{message:'Request updated. Acceptance is not a booking or payment confirmation.'});
   }
   if(action==='withdraw'&&req.method==='PATCH'){
    const result=await d.query("UPDATE travel_date_requests SET status='withdrawn',updated_at=now() WHERE id=$1 AND user_id=$2 AND status IN ('pending','accepted') RETURNING id",[body.id,uid]);if(!result.rowCount)throw fail('Request not found or already closed.',404);
   }else if(action==='close'&&req.method==='PATCH'){
    const result=await d.query("UPDATE travel_date_trips SET status='closed' WHERE id=$1 AND user_id=$2 AND status IN ('pending','published') RETURNING id",[body.id,uid]);if(!result.rowCount)throw fail('Trip not found or already closed.',404);
   }else if(action==='moderate'&&req.method==='PATCH'){
    if(!admin)throw fail('Administrator access required.',403);
    if(!['published','rejected'].includes(body.status))throw fail('Invalid moderation status.');
    const result=await d.query("UPDATE travel_date_trips SET status=$2,reviewed_at=now(),reviewed_by=$3 WHERE id=$1 AND ((status='pending' AND ($2='rejected' OR start_date>=CURRENT_DATE)) OR (status='published' AND $2='rejected')) RETURNING id",[body.id,body.status,uid]);if(!result.rowCount)throw fail('Trip is no longer eligible for this action.',409);
   }else if(action==='resolve'&&req.method==='PATCH'){
    if(!admin)throw fail('Administrator access required.',403);
    await d.query("UPDATE travel_date_reports SET status='resolved' WHERE id=$1",[body.id]);
   }else if((action==='report'||action==='block')&&req.method==='POST'){
    if(action==='report'&&!['scam','harassment','contact','underage','other'].includes(body.reason))throw fail('Choose a report reason.');
    await d.transaction(async c=>{
     await c.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[uid]);
     // A trip owner can also block the sender of a request using its request ID.
     const target=await c.query(action==='block'&&body.kind==='request'?'SELECT r.user_id FROM travel_date_requests r JOIN travel_date_trips t ON t.id=r.trip_id WHERE r.id=$1 AND t.user_id=$2':"SELECT user_id FROM travel_date_trips WHERE id=$1 AND user_id<>$2 AND status='published'",[body.id,uid]);
     if(!target.rowCount)throw fail('This traveller is not available.',404);
     if(action==='block'){
      await c.query('INSERT INTO travel_date_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[uid,target.rows[0].user_id]);
      await c.query("UPDATE travel_date_requests r SET status='withdrawn',updated_at=now() FROM travel_date_trips t WHERE r.trip_id=t.id AND r.status IN ('pending','accepted') AND ((r.user_id=$1 AND t.user_id=$2) OR (r.user_id=$2 AND t.user_id=$1))",[uid,target.rows[0].user_id]);
     }else{
      const count=await c.query("SELECT count(*)::int AS n FROM travel_date_reports WHERE reporter_id=$1 AND created_at>now()-interval '1 day'",[uid]);if(count.rows[0].n>=10)throw fail('Daily report limit reached.',429);
      await c.query('INSERT INTO travel_date_reports(trip_id,reporter_id,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[body.id,uid,body.reason]);
     }
    });
   }else throw fail('Unknown action.');
   return json(res,200,{message:action==='report'?'Report recorded for moderator review.':'Updated successfully.'});
  }catch(e){const failure=e.status?{status:e.status,message:e.message}:publicError(e);return json(res,failure.status,{error:failure.message});}
 };
}
export default createTravelDateHandler();
