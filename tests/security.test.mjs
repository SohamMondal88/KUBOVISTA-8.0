import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyCheckoutSignature, verifyWebhookSignature } from '../server/razorpay.js';
import { isAdmin, requireSession } from '../server/auth.js';

test('checkout signatures bind both order and payment and reject malformed signatures', () => {
 process.env.RAZORPAY_KEY_SECRET='test-only-secret';
 const signature=createHmac('sha256',process.env.RAZORPAY_KEY_SECRET).update('order_1|pay_1').digest('hex');
 assert.equal(verifyCheckoutSignature({orderId:'order_1',paymentId:'pay_1',signature}),true);
 assert.equal(verifyCheckoutSignature({orderId:'order_2',paymentId:'pay_1',signature}),false);
 assert.equal(verifyCheckoutSignature({orderId:'order_1',paymentId:'pay_2',signature}),false);
 assert.equal(verifyCheckoutSignature({orderId:'order_1',paymentId:'pay_1',signature:'bad'}),false);
});
test('webhook verification authenticates exact raw bytes',()=>{
 process.env.RAZORPAY_WEBHOOK_SECRET='test-webhook-secret';
 const raw=Buffer.from('{"event":"payment.captured"}');
 const signature=createHmac('sha256',process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
 assert.equal(verifyWebhookSignature(raw,signature),true);
 assert.equal(verifyWebhookSignature(Buffer.from(raw+' '),signature),false);
 assert.equal(verifyWebhookSignature(raw,undefined),false);
});
test('administrator authorization requires verified identity',()=>{
 process.env.ADMIN_EMAILS='owner@example.com';
 assert.equal(isAdmin({user:{email:'owner@example.com',emailVerified:false}}),false);
 assert.equal(isAdmin({user:{email:'owner@example.com',emailVerified:true}}),true);
 assert.equal(isAdmin({user:{email:'stranger@example.com',emailVerified:true,role:'traveler'}}),false);
});
test('cross-origin and anonymous account mutations fail closed',async()=>{
 delete process.env.DATABASE_URL;
 process.env.APP_URL='https://kubovista.example';
 const response=()=>({setHeader(){},end(body){this.body=JSON.parse(body);}});
 const denied=response();
 assert.equal(await requireSession({method:'POST',headers:{origin:'https://attacker.example'}},denied),null);
 assert.equal(denied.statusCode,403);
 const anonymous=response();
 assert.equal(await requireSession({method:'POST',headers:{origin:'https://kubovista.example'}},anonymous),null);
 assert.equal(anonymous.statusCode,401);
});
