import { readFile } from 'node:fs/promises';
import { getPool } from '../server/db.js';
const pool=getPool();
try { await pool.query(await readFile(new URL('../db/migrations/001_auth_accounts_payments.sql',import.meta.url),'utf8')); console.log('KUBOVISTA database migration complete.'); } finally { await pool.end(); }
