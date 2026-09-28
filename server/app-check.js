import { getAppCheck } from 'firebase-admin/app-check';
import { getFirebaseAdmin } from './firebase-admin.js';

export async function checkAppToken(req,{enabled=process.env.APP_CHECK_ENFORCED==='true',verify=token=>getAppCheck(getFirebaseAdmin()).verifyToken(token)}={}){
 if(!enabled)return true;
 const value=req.headers?.['x-firebase-appcheck'];
 if(typeof value!=='string'||!value||value.length>4096)return false;
 try{const decoded=await verify(value);return Boolean(decoded?.appId);}catch{return false;}
}
