import { toNodeHandler } from 'better-auth/node';
import { authConfigured, getAuth } from '../../server/auth.js';
import { json } from '../../server/http.js';

export default async function handler(req, res) {
  if (!authConfigured()) return json(res, 503, { error: 'Authentication is not configured yet.' });
  return toNodeHandler(getAuth())(req, res);
}

export const config = { api: { bodyParser: false } };
