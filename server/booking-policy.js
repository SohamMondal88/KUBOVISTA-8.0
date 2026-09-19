export function splitTotal(total){
 const value=Number(total);if(!Number.isSafeInteger(value)||value<100)throw Error('Invalid quotation total.');
 const deposit=Math.round(value*20/100);return {deposit,balance:value-deposit};
}
export function validateCancellationPolicy(input){
 const keys=['graceHours','gracePercent','earlyPercent','middlePercent','latePercent'];
 if(!input||keys.some(k=>input[k]===''||input[k]===null||input[k]===undefined))throw Error('Enter every cancellation policy value explicitly.');
 const policy=Object.fromEntries(keys.map(k=>[k,Number(input[k])]));
 if(keys.some(k=>!Number.isInteger(policy[k])||policy[k]<0)||policy.graceHours>168||keys.slice(1).some(k=>policy[k]>100))throw Error('Use whole percentages from 0 to 100 and grace hours from 0 to 168.');
 if(policy.gracePercent>policy.earlyPercent||policy.earlyPercent>policy.middlePercent||policy.middlePercent>policy.latePercent)throw Error('Cancellation percentages must not decrease closer to check-in.');
 return {...policy,version:1};
}
export function cancellationEstimate(booking,paidDeposit,now=new Date()){
 if(booking.payment_policy_version!==2||!booking.cancellation_policy)throw Error('This booking requires a support-reviewed cancellation under its original terms.');
 if(booking.checked_in_at)throw Error('After check-in, please contact support to review cancellation.');
 const checkin=Date.parse(booking.checkin_at),booked=Date.parse(booking.booked_at||booking.created_at),at=Number(now);
 if(!Number.isFinite(checkin)||!Number.isFinite(booked)||at<booked||at>=checkin)throw Error('Cancellation requires support review for these dates.');
 const amount=Number(paidDeposit);if(!Number.isSafeInteger(amount)||amount<0)throw Error('Deposit requires reconciliation.');
 const p=validateCancellationPolicy(booking.cancellation_policy),hoursHeld=(at-booked)/3600000,hoursToCheckin=(checkin-at)/3600000;
 const grace=p.graceHours>0&&hoursHeld<=p.graceHours&&hoursToCheckin>24;
 const band=grace?'grace':hoursToCheckin>168?'early':hoursToCheckin>24?'middle':'late';
 const percent=p[band+'Percent'];const deduction=Math.min(amount,Math.round(amount*percent/100));
 return {band,percent,deposit:amount,deduction,refund:amount-deduction,calculatedAt:new Date(at).toISOString(),bookedAt:new Date(booked).toISOString(),checkinAt:new Date(checkin).toISOString()};
}
export function balanceEligible(booking){return booking.payment_policy_version===2&&!!booking.checked_in_at&&!booking.balance_paid_at&&!booking.cancellation_requested_at&&booking.status!=='cancelled';}
