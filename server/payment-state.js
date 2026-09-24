// Signature verification may happen while a payment is only authorized.
// Apply booking side effects on the first transition to captured, not on the
// first valid signature. Call only while holding the payment row lock.
export function shouldApplyCapture(previousStatus, nextStatus) {
  return nextStatus === 'captured' && ['created', 'authorized', 'failed'].includes(previousStatus);
}
