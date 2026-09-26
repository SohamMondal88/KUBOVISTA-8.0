// jwks-rsa 4.1.0 uses require('jose'), but Vercel can disable require(ESM).
// Preserve jose 6 and all key validation; load it asynchronously instead.
// Revisit this guarded workaround when updating firebase-admin/jwks-rsa.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const adminRequire = createRequire(require.resolve('firebase-admin/auth'));
const entry = adminRequire.resolve('jwks-rsa');
const target = join(dirname(entry), 'utils.js');
const original = await readFile(target, 'utf8');
const marker = '// KuboVistas: load jose through native dynamic import';
if (!original.includes(marker)) {
  const version = JSON.parse(await readFile(join(dirname(entry), '../package.json'), 'utf8')).version;
  if (version !== '4.1.0' || !original.includes("const jose = require('jose');") || !original.includes('async function retrieveSigningKeys(jwks) {')) {
    throw new Error('Review the jwks-rsa ESM compatibility patch before deploying this dependency version.');
  }
  const patched = original.replace("const jose = require('jose');", marker)
    .replace('async function retrieveSigningKeys(jwks) {', "async function retrieveSigningKeys(jwks) {\n  const jose = await import('jose');");
  await writeFile(target, patched);
}
const passportTarget = join(dirname(entry), 'integrations/passport.js');
const passport = await readFile(passportTarget, 'utf8');
if (!passport.includes(marker)) {
  if (!passport.includes("const jose = require('jose');") || !passport.includes('return function secretProvider(req, rawJwtToken, cb) {') || !passport.includes('    try {')) {
    throw new Error('Review the jwks-rsa Passport ESM compatibility patch before deployment.');
  }
  await writeFile(passportTarget, passport.replace("const jose = require('jose');", marker)
    .replace('return function secretProvider(req, rawJwtToken, cb) {', 'return async function secretProvider(req, rawJwtToken, cb) {')
    .replace('    try {', "    try {\n      const jose = await import('jose');"));
}
