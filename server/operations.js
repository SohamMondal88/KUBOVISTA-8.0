import { requireSession, isAdmin, isOperator } from './auth.js';
import { query, transaction } from './db.js';
import { json, methodNotAllowed, parseBody, cleanText, publicError } from './http.js';
import { enqueueEmail, flushEmailSafely } from './transactional-email.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text = (value,max,min=1) => { const result=cleanText(value,max); return result.length>=min ? result : null; };
const fail = (status,error) => ({status,error});

export default async function operations(req,res) {
  if (!['GET','POST'].includes(req.method)) return methodNotAllowed(res,['GET','POST']);
  const session=await requireSession(req,res);if(!session)return;
  const admin=isAdmin(session), staff=isOperator(session)||session.user.role==='support';
  const input=req.method==='GET'?req.query:parseBody(req), action=input.action;
  try {
    if(req.method==='GET') {
      if(action==='dashboard') {
        const [bookings,payments,cases,documents,notices]=await Promise.all([
          query('SELECT id,destination_name,status,departure_date,quote_total_paise,created_at FROM bookings WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10',[session.user.id]),
          query('SELECT booking_id,status,purpose,amount_paise,created_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10',[session.user.id]),
          query("SELECT id,subject,status,updated_at FROM support_cases WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 10",[session.user.id]),
          query('SELECT id,booking_id,kind,document_number,issued_at FROM commercial_documents WHERE booking_id IN (SELECT id FROM bookings WHERE user_id=$1) ORDER BY issued_at DESC LIMIT 10',[session.user.id]),
          query('SELECT count(*)::int AS unread FROM user_notifications WHERE user_id=$1 AND read_at IS NULL',[session.user.id])
        ]);
        return json(res,200,{bookings:bookings.rows,payments:payments.rows,cases:cases.rows,documents:documents.rows,unread:notices.rows[0].unread});
      }
      if(action==='cases') {
        const cases=await query(`SELECT c.*,u.name AS traveler_name FROM support_cases c JOIN "user" u ON u.id=c.user_id
          ${staff?'':'WHERE c.user_id=$1'} ORDER BY c.updated_at DESC LIMIT 100`,staff?[]:[session.user.id]);
        return json(res,200,{cases:cases.rows});
      }
      if(action==='case') {
        if(!uuid(input.id))return json(res,400,{error:'Invalid case reference.'});
        const result=await query('SELECT * FROM support_cases WHERE id=$1 AND (user_id=$2 OR $3::boolean)',[input.id,session.user.id,staff]);
        if(!result.rows[0])return json(res,404,{error:'Case not found.'});
        const messages=await query('SELECT id,author_id,body,internal,created_at FROM support_messages WHERE case_id=$1 AND ($2::boolean OR internal=false) ORDER BY created_at',[input.id,staff]);
        return json(res,200,{case:result.rows[0],messages:messages.rows});
      }
      if(action==='suppliers') {
        if(!staff)return json(res,403,{error:'Staff access required.'});
        return json(res,200,{suppliers:(await query('SELECT * FROM suppliers ORDER BY updated_at DESC LIMIT 100')).rows});
      }
      if(action==='assignments') {
        if(!staff)return json(res,403,{error:'Staff access required.'});
        const rows=await query(`SELECT bs.booking_id,bs.supplier_id,bs.confirmation_reference,bs.supplier_response,bs.supplier_response_at,s.name AS supplier_name,b.destination_name
          FROM booking_suppliers bs JOIN suppliers s ON s.id=bs.supplier_id JOIN bookings b ON b.id=bs.booking_id ORDER BY bs.confirmed_at DESC LIMIT 100`);
        return json(res,200,{assignments:rows.rows});
      }
      if(action==='documents') {
        const where=uuid(input.bookingId)?'AND booking_id=$2':'';
        const args=uuid(input.bookingId)?[session.user.id,input.bookingId]:[session.user.id];
        return json(res,200,{documents:(await query(`SELECT id,booking_id,kind,document_number,issued_at FROM commercial_documents WHERE booking_id IN (SELECT id FROM bookings WHERE user_id=$1) ${where} ORDER BY issued_at DESC LIMIT 100`,args)).rows});
      }
      if(action==='document') {
        if(!uuid(input.id))return json(res,400,{error:'Invalid document reference.'});
        const result=await query(`SELECT d.* FROM commercial_documents d JOIN bookings b ON b.id=d.booking_id WHERE d.id=$1 AND (b.user_id=$2 OR $3::boolean)`,[input.id,session.user.id,staff]);
        return result.rows[0]?json(res,200,{document:result.rows[0]}):json(res,404,{error:'Document not found.'});
      }
      return json(res,404,{error:'Unknown account resource.'});
    }
    if(action==='open_case') {
      const subject=text(input.subject,160,5),body=text(input.message,5000,10);
      const category=['booking','payment','refund','other'].includes(input.category)?input.category:null;
      if(!subject||!body||!category||input.bookingId&&!uuid(input.bookingId))return json(res,400,{error:'Complete the subject, category and message.'});
      const result=await transaction(async client=>{
        if(input.bookingId) {const owned=await client.query('SELECT id FROM bookings WHERE id=$1 AND user_id=$2',[input.bookingId,session.user.id]);if(!owned.rowCount)return fail(404,'Booking not found.');}
        const count=await client.query("SELECT count(*)::int AS n FROM support_cases WHERE user_id=$1 AND created_at>now()-interval '24 hours'",[session.user.id]);
        if(count.rows[0].n>=5)return fail(429,'Daily support case limit reached.');
        const row=(await client.query('INSERT INTO support_cases(user_id,booking_id,subject,category) VALUES($1,$2,$3,$4) RETURNING *',[session.user.id,input.bookingId||null,subject,category])).rows[0];
        await client.query('INSERT INTO support_messages(case_id,author_id,body) VALUES($1,$2,$3)',[row.id,session.user.id,body]);
        return {case:row};
      });return json(res,result.status||201,result.error?{error:result.error}:result);
    }
    if(action==='reply') {
      if(!uuid(input.id)||!text(input.message,5000,2))return json(res,400,{error:'Provide a case and reply.'});
      const result=await transaction(async client=>{
        const c=(await client.query('SELECT * FROM support_cases WHERE id=$1 FOR UPDATE',[input.id])).rows[0];
        if(!c||!staff&&c.user_id!==session.user.id)return fail(404,'Case not found.');
        if(c.status==='closed')return fail(409,'This case is closed.');
        const internal=staff&&input.internal===true;
        const row=(await client.query('INSERT INTO support_messages(case_id,author_id,body,internal) VALUES($1,$2,$3,$4) RETURNING *',[c.id,session.user.id,cleanText(input.message,5000),internal])).rows[0];
        await client.query("UPDATE support_cases SET status=$2,updated_at=now() WHERE id=$1",[c.id,staff?'waiting':'open']);
        if(staff&&!internal){
          await client.query("INSERT INTO user_notifications(user_id,title,message,kind) VALUES($1,'Support replied','Your support case has a new reply. Sign in to read it.','account')",[c.user_id]);
          await enqueueEmail(client,c.user_id,`support:${row.id}`,'support_reply','Your KuboVistas support case has a reply',{path:'/account/support',caseId:c.id});
        }
        await client.query("INSERT INTO audit_logs(actor_id,action,subject_type,subject_id) VALUES($1,'support.replied','case',$2)",[session.user.id,c.id]);
        return {message:row};
      });if(!result.error)await flushEmailSafely();return json(res,result.status||201,result.error?{error:result.error}:result);
    }
    if(action==='case_status') {
      if(!staff||!uuid(input.id)||!['open','waiting','resolved','closed'].includes(input.status))return json(res,403,{error:'Staff access and a valid status are required.'});
      const row=await transaction(async client=>{
        const changed=(await client.query('UPDATE support_cases SET status=$2,assigned_to=$3,updated_at=now() WHERE id=$1 RETURNING *',[input.id,input.status,session.user.id])).rows[0];
        if(changed)await client.query("INSERT INTO audit_logs(actor_id,action,subject_type,subject_id,details) VALUES($1,'support.status','case',$2,$3)",[session.user.id,input.id,JSON.stringify({status:input.status})]);
        return changed;
      });return row?json(res,200,{case:row}):json(res,404,{error:'Case not found.'});
    }
    if(action==='supplier') {
      if(!admin)return json(res,403,{error:'Administrator access required.'});
      const name=text(input.name,140,2),kind=['stay','guide','transport','activity'].includes(input.kind)?input.kind:null;
      if(!name||!kind||input.id&&!uuid(input.id))return json(res,400,{error:'Provide supplier name and type.'});
      const result=await transaction(async client=>{
        const row=input.id
          ?(await client.query(`UPDATE suppliers SET name=$2,kind=$3,contact_email=$4,contact_phone=$5,location=$6,notes=$7,status=$8,updated_at=now() WHERE id=$1 RETURNING *`,[input.id,name,kind,cleanText(input.email,254),cleanText(input.phone,40),cleanText(input.location,140),cleanText(input.notes,1000),input.status==='approved'?'approved':input.status==='suspended'?'suspended':'review'])).rows[0]
          :(await client.query(`INSERT INTO suppliers(name,kind,contact_email,contact_phone,location,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[name,kind,cleanText(input.email,254),cleanText(input.phone,40),cleanText(input.location,140),cleanText(input.notes,1000)])).rows[0];
        if(row)await client.query("INSERT INTO audit_logs(actor_id,action,subject_type,subject_id) VALUES($1,'supplier.saved','supplier',$2)",[session.user.id,row.id]);return row;
      });return result?json(res,200,{supplier:result}):json(res,404,{error:'Supplier not found.'});
    }
    if(action==='assign_supplier') {
      if(!isOperator(session)||!uuid(input.bookingId)||!uuid(input.supplierId)||!text(input.reference,120,3))return json(res,403,{error:'Operator access and verified supplier confirmation required.'});
      const result=await transaction(async client=>{
        const booking=(await client.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE',[input.bookingId])).rows[0];
        const supplier=(await client.query("SELECT * FROM suppliers WHERE id=$1 AND status='approved'",[input.supplierId])).rows[0];
        if(!booking||!supplier||!booking.confirmed_at)return fail(409,'Confirmed booking and approved supplier required.');
        const assigned=(await client.query(`INSERT INTO booking_suppliers(booking_id,supplier_id,confirmation_reference) VALUES($1,$2,$3)
          ON CONFLICT(booking_id,supplier_id) DO NOTHING RETURNING *`,[booking.id,supplier.id,cleanText(input.reference,120)])).rows[0];
        if(!assigned)return fail(409,'Supplier already assigned; review existing confirmation.');
        await client.query("INSERT INTO audit_logs(actor_id,action,subject_type,subject_id) VALUES($1,'supplier.assigned','booking',$2)",[session.user.id,booking.id]);return {assignment:assigned};
      });return json(res,result.status||201,result.error?{error:result.error}:result);
    }
    if(action==='issue_document') {
      if(!admin||!uuid(input.bookingId)||!['invoice','voucher'].includes(input.kind))return json(res,403,{error:'Administrator access required.'});
      const result=await transaction(async client=>{
        const booking=(await client.query('SELECT b.*,u.name,u.email FROM bookings b JOIN "user" u ON u.id=b.user_id WHERE b.id=$1 FOR UPDATE',[input.bookingId])).rows[0];
        if(!booking||!booking.confirmed_at||booking.status==='cancelled')return fail(409,'A confirmed active booking is required.');
        const current=(await client.query('SELECT * FROM commercial_documents WHERE booking_id=$1 AND kind=$2',[booking.id,input.kind])).rows[0];if(current)return {document:current};
        const captured=(await client.query(`SELECT COALESCE(sum(p.amount_paise),0)-COALESCE(sum(COALESCE(r.processed,0)),0) AS total
          FROM payments p LEFT JOIN (SELECT payment_id,sum(amount_paise) AS processed FROM payment_refunds WHERE status='processed' GROUP BY payment_id) r ON r.payment_id=p.id
          WHERE p.booking_id=$1 AND p.captured_at IS NOT NULL AND p.status IN ('captured','refund_pending','refunded')`,[booking.id])).rows[0].total;
        const suppliers=(await client.query(`SELECT s.name,s.kind,s.location,bs.confirmation_reference FROM booking_suppliers bs JOIN suppliers s ON s.id=bs.supplier_id WHERE bs.booking_id=$1 AND s.status='approved' AND bs.supplier_response='accepted'`,[booking.id])).rows;
        if(input.kind==='invoice'&&(process.env.BUSINESS_DETAILS_VERIFIED!=='true'||process.env.LEGAL_TAX_APPROVED!=='true'||!process.env.PUBLIC_LEGAL_NAME?.trim()||!process.env.PUBLIC_BUSINESS_ADDRESS?.trim()||!process.env.PUBLIC_TAX_DISCLOSURE?.trim()||booking.quote_total_paise==null||Number(captured)<Number(booking.quote_total_paise)))return fail(409,'Full payment and approved seller/tax details are required for invoice issuance.');
        if(input.kind==='voucher'&&!suppliers.length)return fail(409,'An approved supplier must accept the recorded confirmation first.');
        const snapshot={seller:process.env.PUBLIC_LEGAL_NAME||'',address:process.env.PUBLIC_BUSINESS_ADDRESS||'',taxDisclosure:process.env.PUBLIC_TAX_DISCLOSURE||'',traveler:booking.name,email:booking.email,bookingId:booking.id,destination:booking.destination_name,travelers:booking.travelers,days:booking.days,checkinAt:booking.checkin_at,totalPaise:Number(booking.quote_total_paise),paidPaise:Number(captured),suppliers};
        const serial=(await client.query("SELECT nextval('commercial_document_number_seq') AS n")).rows[0].n;
        const number=`KV-${input.kind==='invoice'?'INV':'VCH'}-${new Date().getUTCFullYear()}-${String(serial).padStart(6,'0')}`;
        const doc=(await client.query('INSERT INTO commercial_documents(booking_id,kind,document_number,snapshot,issued_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[booking.id,input.kind,number,JSON.stringify(snapshot),session.user.id])).rows[0];
        await client.query("INSERT INTO audit_logs(actor_id,action,subject_type,subject_id,details) VALUES($1,'document.issued','booking',$2,$3)",[session.user.id,booking.id,JSON.stringify({number,kind:input.kind})]);
        await client.query("INSERT INTO user_notifications(user_id,title,message,kind) VALUES($1,'Travel document available',$2,'booking')",[booking.user_id,`${input.kind==='invoice'?'Invoice':'Travel voucher'} ${number} is available in your account.`]);
        await enqueueEmail(client,booking.user_id,`document:${doc.id}`,'document_issued','Your KuboVistas travel document is ready',{path:'/account/documents',number});
        return {document:doc};
      });if(!result.error)await flushEmailSafely();return json(res,result.status||201,result.error?{error:result.error}:result);
    }
    return json(res,404,{error:'Unknown operation.'});
  }catch(error){const failure=publicError(error);return json(res,failure.status,{error:failure.message});}
}
