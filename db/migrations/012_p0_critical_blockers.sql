BEGIN;

ALTER TABLE payment_refunds
  ADD COLUMN IF NOT EXISTS submission_state text NOT NULL DEFAULT 'reserved',
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='payment_refunds_submission_state_check'
      AND conrelid='payment_refunds'::regclass
  ) THEN
    ALTER TABLE payment_refunds ADD CONSTRAINT payment_refunds_submission_state_check
      CHECK (submission_state IN ('reserved','submitting','ambiguous','confirmed','failed'));
  END IF;
END $$;

UPDATE payment_refunds SET submission_state=CASE
  WHEN razorpay_refund_id IS NOT NULL THEN 'confirmed'
  WHEN status='failed' THEN 'failed'
  ELSE 'reserved'
END;

CREATE INDEX IF NOT EXISTS payment_refunds_reconcile_idx
  ON payment_refunds(submission_state, updated_at)
  WHERE submission_state IN ('submitting','ambiguous');

COMMIT;
