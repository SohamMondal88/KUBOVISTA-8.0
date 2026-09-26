import {validPushToken,tokenHash,dispatchPush,dispatcherAuthorized} from '../firebase-push.js';
import { requireSession } from '../auth.js';
import { firestore, plain, serverTimestamp, snapshotData } from '../firestore.js';
import { cleanText, json, methodNotAllowed, parseBody, publicError } from '../http.js';

export default async function handler(req, res) {
  if(req.query?.dispatch==='1'){
    if(req.method!=='POST')return methodNotAllowed(res,['POST']);
    if(!dispatcherAuthorized(req.headers.authorization))return json(res,401,{error:'Unauthorized dispatcher.'});
    try{return json(res,200,await dispatchPush());}catch{return json(res,503,{error:'Notification dispatch unavailable.'});}
  }
  if (!['GET', 'PATCH', 'POST', 'DELETE'].includes(req.method)) return methodNotAllowed(res, ['GET', 'PATCH', 'POST', 'DELETE']);
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    if(req.method==='POST'){
      if(process.env.FIREBASE_PUSH_ENABLED!=='true')return json(res,503,{error:'Booking push notifications are not enabled yet.'});
      const token=parseBody(req).token;
      if(!validPushToken(token))return json(res,400,{error:'Invalid notification device token.'});
      const hash=tokenHash(token);
      await firestore().collection('devices').doc(hash).set({token_hash:hash,token,user_id:session.user.id,updated_at:serverTimestamp()});
      return json(res,200,{success:true});
    }
    if(req.method==='DELETE'){
      const body=parseBody(req);
      const db=firestore();
      if(body.all===true){const devices=await db.collection('devices').where('user_id','==',session.user.id).get();const batch=db.batch();devices.docs.forEach(item=>batch.delete(item.ref));await batch.commit();}
      else if(validPushToken(body.token)){const ref=db.collection('devices').doc(tokenHash(body.token));const snapshot=await ref.get();if(snapshot.exists&&snapshot.data().user_id===session.user.id)await ref.delete();}
      else return json(res,400,{error:'Choose a notification device to remove.'});
      return json(res,200,{success:true});
    }
    if (req.method === 'GET') {
      const snapshot=await firestore().collection('notifications').where('user_id','==',session.user.id).limit(100).get();
      const notifications=snapshot.docs.map(snapshotData).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
      return json(res, 200, { notifications });
    }
    const id = cleanText(parseBody(req).id, 80);
    const db=firestore();
    if(id){const ref=db.collection('notifications').doc(id),snapshot=await ref.get();if(snapshot.exists&&snapshot.data().user_id===session.user.id&&!snapshot.data().read_at)await ref.update({read_at:serverTimestamp()});}
    else {const snapshot=await db.collection('notifications').where('user_id','==',session.user.id).get();const batch=db.batch();snapshot.docs.forEach(item=>{if(!item.data().read_at)batch.update(item.ref,{read_at:serverTimestamp()});});await batch.commit();}
    return json(res, 200, { success: true });
  } catch (error) {
    const failure = publicError(error);
    return json(res, failure.status, { error: failure.message });
  }
}
