import { readFile } from 'node:fs/promises';
import { getPool } from '../server/db.js';
const pool=getPool();
try { for (const name of ['001_auth_accounts_payments.sql','002_journal.sql','003_enquiries.sql','004_deposit_lifecycle.sql','005_kubo_usage.sql']) await pool.query(await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8')); console.log('KUBOVISTA database migration complete.'); } finally { await pool.end(); }
