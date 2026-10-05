import { getRazorpay } from "./razorpay.js";

const VALID_REFUND_STATES = new Set(["pending", "processed", "failed"]);

export class RefundSubmissionError extends Error {
  constructor(
    message,
    { ambiguous = true, code = "refund-provider-error" } = {},
  ) {
    super(message);
    this.name = "RefundSubmissionError";
    this.code = code;
    this.ambiguous = ambiguous;
  }
}

function validateRefund(refund, paymentId, amountPaise) {
  if (
    refund?.payment_id !== paymentId ||
    Number(refund?.amount) !== Number(amountPaise) ||
    !VALID_REFUND_STATES.has(refund?.status)
  )
    throw new RefundSubmissionError("Refund response needs operator review.", {
      code: "refund-provider-mismatch",
    });
  return refund;
}

export async function listRemoteRefunds(paymentId) {
  const result = await getRazorpay().refunds.all({
    payment_id: paymentId,
    count: 100,
  });
  return Array.isArray(result?.items) ? result.items : [];
}

export function matchRemoteRefund(
  refunds,
  { paymentId, amountPaise, attemptId },
) {
  const matches = refunds.filter(
    (refund) =>
      refund.payment_id === paymentId &&
      Number(refund.amount) === Number(amountPaise) &&
      (refund.receipt === attemptId ||
        refund.notes?.kubovistas_refund_attempt === attemptId),
  );
  if (matches.length > 1)
    throw new RefundSubmissionError("Multiple provider refunds need review.", {
      code: "multiple-refund-matches",
    });
  return matches[0] || null;
}

export async function issueRefund(paymentId, amountPaise, attemptId) {
  try {
    const refund = await getRazorpay().payments.refund(paymentId, {
      amount: amountPaise,
      speed: "normal",
      receipt: attemptId,
      notes: { kubovistas_refund_attempt: attemptId },
    });
    return validateRefund(refund, paymentId, amountPaise);
  } catch (error) {
    if (error instanceof RefundSubmissionError) throw error;
    const status = Number(error?.statusCode || error?.status || 0);
    const ambiguous =
      !status || status === 408 || status === 429 || status >= 500;
    throw new RefundSubmissionError(
      ambiguous
        ? "Refund submission result is unknown; reconcile before retrying."
        : "Refund request was rejected by the provider.",
      {
        ambiguous,
        code: ambiguous ? "refund-submission-ambiguous" : "refund-rejected",
      },
    );
  }
}

export async function remotePayment(paymentId) {
  return getRazorpay().payments.fetch(paymentId);
}

export async function remoteRefund(paymentId, refundId) {
  return getRazorpay().refunds.fetch(refundId, { payment_id: paymentId });
}
