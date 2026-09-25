import { createHash, timingSafeEqual } from 'node:crypto';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirebaseAdmin } from './firebase-admin.js';
import { query } from './db.js';
export function tokenHash(token){return createHash('sha256').update(token).digest('hex');}
export function validPushToken(token){return typeof token==='string' && token.length>=30 && token.length<=4096 && /^[A-Za-z0-9_:\-]+$/.test(token);}
export function dispatcherAuthorized(header,secret=process.env.PUSH_DISPATCH_SECRET){
  if(!secret || secret.length<32 || typeof header!=='string')return false;
  const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(header);
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export function privatePushPayload(delivery,origin){
  return {token:delivery.token,notification:{title:'KuboVistas trip update',body:'You have a new account update. Sign in to view it.'},data:{notificationId:delivery.notification_id},webpush:{headers:{TTL:'3600'},notification:{tag:delivery.notification_id},fcmOptions:{link:origin+'/#/notifications'}}};
}
export async function dispatchPush({userId=null,runQuery=query,send=message=>getMessaging(getFirebaseAdmin()).send(message)}={}){
  if(process.env.FIREBASE_PUSH_ENABLED!=='true')return {enabled:false,sent:0};
  const origin=new URL(process.env.APP_URL).origin;
  // Claims have a lease; a crashed worker becomes retryable without holding a DB transaction over a network request.
  const claimed=await runQuery(`WITH pending AS (
    SELECT p.id FROM firebase_push_deliveries p JOIN firebase_devices d ON d.token_hash=p.token_hash AND d.user_id=p.user_id
    JOIN "user" u ON u.id=p.user_id WHERE ($1::text IS NULL OR p.user_id=$1) AND p.sent_at IS NULL AND p.attempts<6 AND p.available_at<=now()
    AND (p.locked_until IS NULL OR p.locked_until<now()) AND p.created_at>now()-interval '24 hours'
    AND d.updated_at>now()-interval '30 days' AND u.disabled_at IS NULL
    ORDER BY p.created_at LIMIT 20 FOR UPDATE OF p SKIP LOCKED)
    UPDATE firebase_push_deliveries p SET locked_until=now()+interval '2 minutes',attempts=attempts+1 FROM pending WHERE p.id=pending.id RETURNING p.*`,[userId]);
  let sent=0;
  await Promise.all(claimed.rows.map(async delivery=>{
    // Recheck account ownership after claiming: token reassignment must not deliver an old account's queue.
    const device=await runQuery('SELECT token FROM firebase_devices WHERE token_hash=$1 AND user_id=$2',[delivery.token_hash,delivery.user_id]);
    if(!device.rowCount)return;
    try{
      await send(privatePushPayload({...delivery,token:device.rows[0].token},origin));
      await runQuery('UPDATE firebase_push_deliveries SET sent_at=now(),locked_until=NULL,last_error=NULL WHERE id=$1',[delivery.id]);sent++;
    }catch(error){
      const code=String(error.code||'delivery-failed').slice(0,120);
      if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code))await runQuery('DELETE FROM firebase_devices WHERE token_hash=$1 AND user_id=$2',[delivery.token_hash,delivery.user_id]);
      else await runQuery("UPDATE firebase_push_deliveries SET locked_until=NULL,last_error=$2,available_at=now()+interval '5 minutes' WHERE id=$1",[delivery.id,code]);
    }
  }));
  await runQuery("DELETE FROM firebase_devices WHERE updated_at<now()-interval '30 days'");
  await runQuery("DELETE FROM firebase_push_deliveries WHERE created_at<now()-interval '7 days'");
  return {enabled:true,claimed:claimed.rowCount,sent};
}

export async function flushPushSafely(userId){
  let timer;
  try{
    // Never make a successful booking wait indefinitely for an optional push provider.
    const work=dispatchPush({userId}).catch(()=>console.warn('Firebase push remains queued for retry.'));
    await Promise.race([work,new Promise(resolve=>{timer=setTimeout(resolve,2500);})]);
  }finally{clearTimeout(timer);}
}
