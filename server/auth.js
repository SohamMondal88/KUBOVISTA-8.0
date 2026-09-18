import { betterAuth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { APIError } from 'better-auth/api';
import { getPool, databaseConfigured } from './db.js';
import { emailConfigured, sendAuthEmail } from './email.js';

let authInstance;

function socialProviders() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return {};
  return { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } };
}

function trustedOrigins() {
  return [process.env.BETTER_AUTH_URL, ...(process.env.AUTH_TRUSTED_ORIGINS || '').split(',')]
    .map(value => value?.trim()).filter(Boolean);
}

export function authConfigured() {
  return databaseConfigured() && emailConfigured() && Boolean(process.env.BETTER_AUTH_SECRET?.length >= 32 && process.env.BETTER_AUTH_URL);
}

export function getAuth() {
  if (!authConfigured()) throw new Error('Authentication is not configured.');
  if (!authInstance) {
    authInstance = betterAuth({
      appName: 'KUBOVISTA',
      baseURL: process.env.BETTER_AUTH_URL,
      secret: process.env.BETTER_AUTH_SECRET,
      database: getPool(),
      trustedOrigins: trustedOrigins(),
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 10,
        requireEmailVerification: emailConfigured(),
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, url }) => sendAuthEmail({
          to: user.email,
          subject: 'Reset your KUBOVISTA password',
          heading: 'Choose a new password.',
          message: 'This secure link lets you reset your KUBOVISTA password. It expires automatically.',
          actionLabel: 'Reset password',
          actionUrl: url
        })
      },
      emailVerification: {
        sendOnSignUp: emailConfigured(),
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) => sendAuthEmail({
          to: user.email,
          subject: 'Verify your KUBOVISTA email',
          heading: 'One quick check.',
          message: 'Verify your email to protect your travel plans and account.',
          actionLabel: 'Verify email',
          actionUrl: url
        })
      },
      socialProviders: socialProviders(),
      user: {
        additionalFields: {
          role: { type: 'string', required: false, defaultValue: 'traveler', input: false }
        },
        deleteUser: { enabled: true, beforeDelete: async user => { const result = await getPool().query('SELECT id FROM payments WHERE user_id=$1 LIMIT 1', [user.id]); if (result.rowCount) throw new APIError('BAD_REQUEST', { message: 'Accounts with transaction records require a support-assisted closure to preserve financial records.' }); } }
      },
      session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
      rateLimit: { enabled: true, storage: 'database', window: 60, max: 100 }
    });
  }
  return authInstance;
}

export async function getSession(req) {
  if (!authConfigured()) return null;
  return getAuth().api.getSession({ headers: fromNodeHeaders(req.headers) });
}

export async function requireSession(req, res) {
  if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== new URL(process.env.BETTER_AUTH_URL || 'http://localhost:3000').origin) { res.statusCode=403; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({error:'Request origin is not allowed.'})); return null; }
  const session = await getSession(req);
  if (!session) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'Please sign in to continue.' }));
    return null;
  }
  return session;
}

export function isAdmin(session) {
  const configured = (process.env.ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  return session?.user?.emailVerified === true && (session?.user?.role === 'admin' || configured.includes(session?.user?.email?.toLowerCase()));
}
