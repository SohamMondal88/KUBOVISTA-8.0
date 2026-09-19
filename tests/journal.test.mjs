import test from 'node:test';
import assert from 'node:assert/strict';
import {instagramURL,validatePost} from '../server/journal.js';
const valid={title:'A mountain morning',summary:'A thoughtful walk through a quiet mountain village.',body:'We took our time walking through the village, asked permission before taking photographs, and left the paths as we found them.',consent:true};
test('Instagram links allow only canonical secure post/reel permalinks',()=>{
 assert.equal(instagramURL('https://www.instagram.com/reel/ABC_12/?utm_source=test'),'https://www.instagram.com/reel/ABC_12/');
 for(const url of ['javascript:alert(1)','https://instagram.com.evil.test/p/a/','http://instagram.com/p/a/','https://evil@instagram.com/p/a/','https://instagram.com/direct/inbox/','https://instagram.com:444/p/a/'])assert.equal(instagramURL(url),null);
});
test('travelers cannot spoof company authorship or Instagram publication type',()=>{
 assert.equal(validatePost({...valid,kind:'company'},false).kind,'traveler');
 assert.equal(validatePost({...valid,kind:'instagram',instagram_url:'https://instagram.com/p/a/'},false).instagram_url,null);
 assert.equal(validatePost({...valid,kind:'company'},true).kind,'company');
});
test('publication requires meaningful content and consent',()=>{
 assert.throws(()=>validatePost({...valid,consent:false},false));
 assert.throws(()=>validatePost({...valid,body:'short'},false));
 assert.throws(()=>validatePost({...valid,kind:'instagram',instagram_url:'https://example.com'},true));
});
