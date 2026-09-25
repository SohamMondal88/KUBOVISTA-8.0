import { requireSession, getAuth } from '../../server/auth.js';
import { query, transaction } from '../../server/db.js';
import { json, methodNotAllowed } from '../../server/http.js';
export const config = { api: { bodyParser: false } };
export default async function handler(req,res) {
  const action=new URL(req.url,'http://localhost').pathname.split('/').pop();
  if (!['get-session','revoke-sessions','delete-user'].includes(action)) return json(res,404,{error:'Use Firebase Authentication for sign-in, verification and password recovery.'});
  if (req.method !== (action==='get-session'?'GET':'POST')) return methodNotAllowed(res,[action==='get-session'?'GET':'POST']);
  const session=await requireSession(req,res);if(!session)return;
  if(action==='get-session')return json(res,200,{user:session.user});
  if(!session.authTime || Date.now()/1000-session.authTime>300)return json(res,401,{error:'Sign in again before changing account security.'});
  try {
    if(action==='revoke-sessions') {
      await getAuth().revokeRefreshTokens(session.firebaseUid);
      await query('DELETE FROM firebase_devices WHERE user_id=$1',[session.user.id]);
      return json(res,200,{success:true});
    }
    const blocked=await transaction(async client=>{
      await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[session.user.id]);
      const payments=await client.query('SELECT id FROM payments WHERE user_id=$1 LIMIT 1',[session.user.id]);
      if(payments.rowCount)return true;
      await client.query('UPDATE "user" SET disabled_at=now() WHERE id=$1',[session.user.id]);
      await client.query('DELETE FROM firebase_devices WHERE user_id=$1',[session.user.id]);
      return false;
    });
    if(blocked)return json(res,409,{error:'Accounts with payment records require support-assisted closure to preserve financial records.'});
    // A failure leaves a disabled local account for operator recovery; never re-enable implicitly.
    await getAuth().deleteUser(session.firebaseUid);
    await query('DELETE FROM "user" WHERE id=$1',[session.user.id]);
    return json(res,200,{success:true});
  } catch { return json(res,503,{error:'The security operation needs support review. Please do not create a replacement account.'}); }
}
