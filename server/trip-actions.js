import {requireSession,isAdmin} from './auth.js';
import {transaction} from './db.js';
import {json,parseBody,cleanText,methodNotAllowed} from './http.js';
import {cancellationEstimate} from './booking-policy.js';
export default async function tripActions(req,res){
 if(!['GET','POST'].includes(req.method))return methodNotAllowed(res,['GET','POST']);
 const session=await requireSession(req,res);if(!session)return;
 const body=req.method==='GET'?req.query:parseBody(req);const id=body.bookingId;
 if(!/^[0-9a-f-]{36}$/i.test(id||''))return json(res,400,{error:'Choose a valid booking.'});
 try{
  const result=await transaction(async client=>{
   const result=await client.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE',[id]);const b=result.rows[0];
   if(!b||b.user_id!==session.user.id&&!isAdmin(session))return {status:404,error:'Booking not found.'};
   const {rows:payments}=await client.query('SELECT * FROM payments WHERE booking_id=$1',[id]);
   const deposit=payments.find(p=>p.purpose==='deposit'&&p.status==='captured');
   if(req.method==='GET'){
    if(b.cancellation_requested_at)return {status:200,cancellation:{deduction:Number(b.cancellation_fee_paise),refund:Number(b.cancellation_refund_paise),recorded:true},booking:b};
    if(payments.some(p=>['created','authorized','failed','refund_pending','refunded'].includes(p.status)))return {status:409,error:'A payment or refund needs reconciliation before cancellation. Contact support.'};
    return {status:200,cancellation:cancellationEstimate(b,Number(deposit?.amount_paise||0)),booking:b};
   }
   if(['confirm','checkin'].includes(body.action)){
    if(!isAdmin(session))return {status:403,error:'Only a verified operator can confirm a booking or check-in.'};
    if(!deposit||b.cancellation_requested_at||b.status==='cancelled')return {status:409,error:'A captured deposit and an active booking are required.'};
    if(body.action==='checkin'&&(!b.confirmed_at||!b.checkin_at||Date.parse(b.checkin_at)>Date.now()))return {status:409,error:'Confirm the booking first; check-in cannot be recorded before its scheduled time.'};
    await client.query(body.action==='confirm'?"UPDATE bookings SET status='confirmed',confirmed_at=COALESCE(confirmed_at,now()),updated_at=now() WHERE id=$1":"UPDATE bookings SET checked_in_at=COALESCE(checked_in_at,now()),updated_at=now() WHERE id=$1",[id]);
    return {status:200,updated:true};
   }
   if(body.action!=='cancel'||b.user_id!==session.user.id)return {status:403,error:'Only the traveler can request this cancellation.'};
   if(b.cancellation_requested_at)return {status:200,cancellation:{deduction:Number(b.cancellation_fee_paise),refund:Number(b.cancellation_refund_paise),recorded:true}};
   if(payments.some(p=>['created','authorized','failed','refund_pending','refunded'].includes(p.status)||p.purpose==='balance'))return {status:409,error:'A payment or refund needs reconciliation. Contact support before cancellation.'};
   const estimate=cancellationEstimate(b,Number(deposit?.amount_paise||0));
   if(body.accept!==true||body.expectedFee!==estimate.deduction)return {status:409,error:'Review the latest cancellation calculation before confirming.'};
   await client.query("UPDATE bookings SET status='cancelled',cancellation_requested_at=now(),cancellation_fee_paise=$2,cancellation_refund_paise=$3,cancellation_reason=$4,updated_at=now() WHERE id=$1",[id,estimate.deduction,estimate.refund,cleanText(body.reason,1000)]);
   await client.query("INSERT INTO user_notifications(user_id,title,message,kind) VALUES($1,'Cancellation recorded',$2,'booking')",[b.user_id,'Your cancellation deduction and refundable remainder are recorded. Any refund is pending operator reconciliation and processing.']);
   return {status:200,cancellation:{...estimate,recorded:true}};
  });
  return json(res,result.status,result);
 }catch(error){return json(res,409,{error:error.message?.startsWith('This booking')||error.message?.startsWith('After check-in')||error.message?.startsWith('Cancellation requires')?error.message:'This request needs support review. No new cancellation has been recorded.'});}
}
