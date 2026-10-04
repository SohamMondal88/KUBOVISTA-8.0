BEGIN;

CREATE TABLE IF NOT EXISTS payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  quote_id uuid NOT NULL REFERENCES booking_quotes(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN ('deposit','balance')),
  attempt_no integer NOT NULL CHECK (attempt_no BETWEEN 1 AND 20),
  receipt text NOT NULL UNIQUE,
  provider_order_id text UNIQUE,
  amount_paise bigint NOT NULL CHECK (amount_paise >= 100),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN (
    'reserved','creating','created','attempted','authorized','captured',
    'failed','expired','ambiguous','superseded'
  )),
  provider_status text,
  failure_code text,
  expires_at timestamptz NOT NULL,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, purpose, attempt_no)
);
CREATE INDEX IF NOT EXISTS payment_attempts_booking_idx
  ON payment_attempts(booking_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_attempts_reconcile_idx
  ON payment_attempts(status, updated_at)
  WHERE status IN ('creating','ambiguous');

ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_attempt_id uuid REFERENCES payment_attempts(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS payments_attempt_unique ON payments(payment_attempt_id) WHERE payment_attempt_id IS NOT NULL;

ALTER TABLE payment_webhook_events ALTER COLUMN payload DROP NOT NULL;
ALTER TABLE payment_webhook_events ADD COLUMN IF NOT EXISTS payload_sha256 text;
ALTER TABLE payment_webhook_events ADD COLUMN IF NOT EXISTS provider_entity_id text;
ALTER TABLE payment_webhook_events ADD COLUMN IF NOT EXISTS provider_order_id text;
ALTER TABLE payment_webhook_events ADD COLUMN IF NOT EXISTS provider_status text;
ALTER TABLE payment_webhook_events ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE payment_webhook_events ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days');
UPDATE payment_webhook_events SET
  payload_sha256=COALESCE(payload_sha256,encode(digest(payload::text,'sha256'),'hex')),
  provider_entity_id=COALESCE(provider_entity_id,payload #>> '{payload,payment,entity,id}',payload #>> '{payload,refund,entity,id}'),
  provider_order_id=COALESCE(provider_order_id,payload #>> '{payload,payment,entity,order_id}'),
  provider_status=COALESCE(provider_status,payload #>> '{payload,payment,entity,status}',payload #>> '{payload,refund,entity,status}'),
  payload=NULL
WHERE payload IS NOT NULL;

CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket text NOT NULL,
  subject_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (bucket, subject_hash)
);
CREATE INDEX IF NOT EXISTS api_rate_limits_expiry_idx ON api_rate_limits(expires_at);

COMMIT;
