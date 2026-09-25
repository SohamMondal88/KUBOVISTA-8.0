// Run dry first. Never infer account ownership on the public sign-in path.
import { getAuth } from '../server/auth.js';
import { getPool } from '../server/db.js';
const apply=process.argv.includes('--apply');
const pool=getPool();
try{
  const {rows}=await pool.query('SELECT id,name,email,"emailVerified",disabled_at FROM "user" WHERE firebase_uid IS NULL ORDER BY "createdAt"');
  console.log(`${apply?'APPLY':'DRY RUN'}: ${rows.length} accounts need mapping.`);
  for(const user of rows){
    if(user.disabled_at){console.log('Skip disabled account',user.id);continue;}
    if(!apply){console.log('Would create/map Firebase UID',user.id,'(password reset required)');continue;}
    let remote;
    try{remote=await getAuth().getUser(user.id);}catch(error){if(error.code!=='auth/user-not-found')throw error;}
    if(remote){
      // Allows recovery after this command created the identity but SQL commit failed.
      if(remote.email?.toLowerCase()!==user.email.toLowerCase()||remote.disabled)throw Error('UID conflict; stop and review '+user.id);
    }else{
      // Email-already-exists fails closed. Operators must review and explicitly map such an account.
      remote=await getAuth().createUser({uid:user.id,email:user.email,emailVerified:user.emailVerified,displayName:user.name.slice(0,128)});
    }
    await pool.query('UPDATE "user" SET firebase_uid=$1 WHERE id=$2 AND firebase_uid IS NULL',[remote.uid,user.id]);
    console.log('Mapped',user.id);
  }
  console.log('Old passwords were not imported. Users must use Firebase Forgot password; verification is still required.');
}finally{await pool.end();}
