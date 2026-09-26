import { requireSession, getAuth } from '../../server/auth.js';
import { firestore, serverTimestamp } from '../../server/firestore.js';
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
      const devices=await firestore().collection('devices').where('user_id','==',session.user.id).get();
      const batch=firestore().batch();devices.docs.forEach(item=>batch.delete(item.ref));await batch.commit();
      return json(res,200,{success:true});
    }
    const db=firestore();
    const payments=await db.collection('payments').where('user_id','==',session.user.id).limit(1).get();
    const blocked=!payments.empty;
    if(blocked)return json(res,409,{error:'Accounts with payment records require support-assisted closure to preserve financial records.'});
    await db.collection('users').doc(session.user.id).set({disabled_at:serverTimestamp()},{merge:true});
    await getAuth().deleteUser(session.firebaseUid);
    const collections=['users','profiles','settings'];const batch=db.batch();collections.forEach(name=>batch.delete(db.collection(name).doc(session.user.id)));
    const devices=await db.collection('devices').where('user_id','==',session.user.id).get();devices.docs.forEach(item=>batch.delete(item.ref));await batch.commit();
    return json(res,200,{success:true});
  } catch { return json(res,503,{error:'The security operation needs support review. Please do not create a replacement account.'}); }
}
