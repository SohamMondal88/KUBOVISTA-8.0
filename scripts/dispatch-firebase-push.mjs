import { dispatchPush } from '../server/firebase-push.js';
import { getPool } from '../server/db.js';
try {console.log(await dispatchPush());} finally {await getPool().end();}
