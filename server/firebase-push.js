import { createHash, timingSafeEqual } from 'node:crypto';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirebaseAdmin } from './firebase-admin.js';
import { firestore, serverTimestamp, snapshotData } from './firestore.js';
export function tokenHash(token){return createHash('sha256').update(token).digest('hex');}
export function validPushToken(token){return typeof token==='string' && token.length>=30 && token.length<=4096 && /^[A-Za-z0-9_:\-]+$/.test(token);}
export function dispatcherAuthorized(header,secret=process.env.PUSH_DISPATCH_SECRET){
  if(!secret || secret.length<32 || typeof header!=='string')return false;
  const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(header);
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export function privatePushPayload(delivery,origin){
  return {token:delivery.token,notification:{title:'KuboVistas trip update',body:'You have a new account update. Sign in to view it.'},data:{notificationId:delivery.notification_id},webpush:{headers:{TTL:'3600'},notification:{tag:delivery.notification_id},fcmOptions:{link:origin+'/account/notifications'}}};
}
export async function dispatchPush({userId=null,db=firestore(),send=message=>getMessaging(getFirebaseAdmin()).send(message)}={}){
  if(process.env.FIREBASE_PUSH_ENABLED!=='true')return {enabled:false,sent:0};
  const origin=new URL(process.env.APP_URL).origin;
  const notificationQuery=userId?db.collection('notifications').where('user_id','==',userId):db.collection('notifications');
  const notifications=(await notificationQuery.limit(20).get()).docs.map(snapshotData).filter(item=>!item.read_at);
  let claimed=0,sent=0;
  for(const notification of notifications){
    const devices=(await db.collection('devices').where('user_id','==',notification.user_id).limit(10).get()).docs.map(snapshotData);
    await Promise.all(devices.map(async device=>{
      const deliveryId=tokenHash(`${notification.id}:${device.token_hash}`),ref=db.collection('push_deliveries').doc(deliveryId);
      const shouldSend=await db.runTransaction(async transaction=>{
        const snapshot=await transaction.get(ref),existing=snapshot.exists?snapshot.data():null;
        if(existing?.sent_at||Number(existing?.attempts||0)>=6)return false;
        transaction.set(ref,{notification_id:notification.id,token_hash:device.token_hash,user_id:notification.user_id,attempts:Number(existing?.attempts||0)+1,last_error:null,updated_at:serverTimestamp(),created_at:existing?.created_at||serverTimestamp()},{merge:true});
        return true;
      });
      if(!shouldSend)return;claimed++;
    try{
        await send(privatePushPayload({notification_id:notification.id,token:device.token},origin));
        await ref.set({sent_at:serverTimestamp(),last_error:null,updated_at:serverTimestamp()},{merge:true});sent++;
    }catch(error){
      const code=String(error.code||'delivery-failed').slice(0,120);
        if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code))await db.collection('devices').doc(device.token_hash).delete();
        else await ref.set({last_error:code,updated_at:serverTimestamp()},{merge:true});
    }
    }));
  }
  return {enabled:true,claimed,sent};
}

export async function flushPushSafely(userId){
  let timer;
  try{
    // Never make a successful booking wait indefinitely for an optional push provider.
    const work=dispatchPush({userId}).catch(()=>console.warn('Firebase push remains queued for retry.'));
    await Promise.race([work,new Promise(resolve=>{timer=setTimeout(resolve,2500);})]);
  }finally{clearTimeout(timer);}
}
