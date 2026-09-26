import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import '../scripts/patch-jwks-esm.mjs';
test('Firebase API and RSA key retrieval work with require(ESM) disabled', () => {
  const result = spawnSync(process.execPath, ['--no-experimental-require-module', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { generateKeyPairSync, createPublicKey } from 'node:crypto';
    import { createRequire } from 'node:module';
    import handler from './api/config.js';
    const require=createRequire(import.meta.url);
    const adminRequire=createRequire(require.resolve('firebase-admin/auth'));
    const {retrieveSigningKeys}=adminRequire('jwks-rsa/src/utils.js');
    const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
    const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',use:'sig',alg:'RS256'};
    const keys=await retrieveSigningKeys([jwk]);
    assert.equal(keys.length,1);
    assert.equal(keys[0].kid,'test-key');
    assert.equal(createPublicKey(keys[0].getPublicKey()).export({format:'jwk'}).n,jwk.n);
    assert.deepEqual(await retrieveSigningKeys([{kty:'RSA',n:'invalid',use:'enc'}]),[]);
    let response;
    const res={setHeader(){},end(body){response=JSON.parse(body)}};
    handler({method:'GET',query:{}},res);
    assert.equal(res.statusCode,200);
    assert.equal(response.authProvider,'firebase');
  `], {cwd:new URL('../',import.meta.url),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
