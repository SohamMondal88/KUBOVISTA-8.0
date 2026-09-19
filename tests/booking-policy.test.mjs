import test from 'node:test';
import assert from 'node:assert/strict';
import {splitTotal,validateCancellationPolicy,cancellationEstimate,balanceEligible} from '../server/booking-policy.js';
import {socialLinks} from '../server/social-links.js';
const policy={graceHours:24,gracePercent:0,earlyPercent:10,middlePercent:50,latePercent:100}; // Test fixture only; no business defaults.
const booking={payment_policy_version:2,cancellation_policy:policy,booked_at:'2026-10-01T00:00:00Z',checkin_at:'2026-10-20T00:00:00Z'};
test('20/80 amounts preserve exact totals including rounding',()=>{for(const total of [100,101,999,100000,1234567]){const s=splitTotal(total);assert.equal(s.deposit+s.balance,total);assert.equal(s.deposit,Math.round(total*.2));}assert.throws(()=>splitTotal(-1));});
test('no implicit cancellation rates and invalid/decreasing rates rejected',()=>{assert.throws(()=>validateCancellationPolicy({}));assert.throws(()=>validateCancellationPolicy({...policy,earlyPercent:''}));assert.throws(()=>validateCancellationPolicy({...policy,latePercent:101}));assert.throws(()=>validateCancellationPolicy({...policy,middlePercent:1}));});
test('deductions use booking age and exact check-in cutoff boundaries',()=>{
 assert.equal(cancellationEstimate(booking,20000,new Date('2026-10-01T12:00:00Z')).deduction,0);
 assert.equal(cancellationEstimate(booking,20000,new Date('2026-10-12T23:59:59Z')).deduction,2000);
 assert.equal(cancellationEstimate(booking,20000,new Date('2026-10-13T00:00:00Z')).deduction,10000);
 assert.equal(cancellationEstimate(booking,20000,new Date('2026-10-19T00:00:00Z')).deduction,20000);
});
test('late booking cannot use grace window to bypass last-day terms',()=>{
 const late={...booking,booked_at:'2026-10-19T00:00:00Z'};const result=cancellationEstimate(late,20000,new Date('2026-10-19T01:00:00Z'));assert.equal(result.band,'late');assert.equal(result.refund,0);
});
test('legacy and post-check-in cancellations require manual review',()=>{
 assert.throws(()=>cancellationEstimate({...booking,payment_policy_version:1},20000,new Date('2026-10-10')));
 assert.throws(()=>cancellationEstimate({...booking,checked_in_at:'2026-10-20'},20000,new Date('2026-10-20')));
 assert.throws(()=>cancellationEstimate(booking,20000,new Date('2026-10-20T00:00:00Z')));
});
test('deduction is capped by captured deposit and unpaid cancellation has no fee',()=>{
 for(const amount of [0,101,20000]){const q=cancellationEstimate(booking,amount,new Date('2026-10-13'));assert.equal(q.deduction+q.refund,amount);assert.ok(q.deduction<=amount);}
});
test('balance eligibility rejects premature, paid, legacy or cancelled bookings',()=>{
 const ready={payment_policy_version:2,status:'confirmed',checked_in_at:'2026-10-20'};assert.equal(balanceEligible(ready),true);
 for(const change of [{checked_in_at:null},{balance_paid_at:'2026-10-20'},{payment_policy_version:1},{status:'cancelled'},{cancellation_requested_at:'2026-10-19'}])assert.equal(balanceEligible({...ready,...change}),false);
});
test('social destinations reject unsafe URLs and invented defaults',()=>{
 const links=socialLinks({PUBLIC_YOUTUBE_URL:'javascript:alert(1)',PUBLIC_WHATSAPP_URL:'https://evil.example/a',PUBLIC_LINKEDIN_URL:'https://www.linkedin.com/company/kubovista/'});assert.equal(links.youtube,undefined);assert.equal(links.whatsapp,undefined);assert.equal(links.twitter,undefined);assert.ok(links.linkedin.startsWith('https://www.linkedin.com/'));
});
