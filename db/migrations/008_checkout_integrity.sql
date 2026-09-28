BEGIN;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS current_quote_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS booking_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
 version integer NOT NULL, total_paise bigint NOT NULL CHECK(total_paise>0), advance_percent integer NOT NULL CHECK(advance_percent BETWEEN 1 AND 100),
 notes text NOT NULL, cancellation_policy jsonb NOT NULL, checkin_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 issued_by text NOT NULL REFERENCES "user"(id), issued_at timestamptz NOT NULL DEFAULT now(), UNIQUE(booking_id,version), UNIQUE(id,booking_id)
);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES booking_quotes(id) ON DELETE RESTRICT;
CREATE TABLE IF NOT EXISTS quote_acceptances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quote_id uuid NOT NULL REFERENCES booking_quotes(id) ON DELETE RESTRICT,
 booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT, user_id text NOT NULL REFERENCES "user"(id),
 purpose text NOT NULL CHECK(purpose IN ('deposit','balance')), accepted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(quote_id,user_id,purpose)
);
CREATE TABLE IF NOT EXISTS payment_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
 razorpay_refund_id text UNIQUE, request_key text NOT NULL UNIQUE, amount_paise bigint NOT NULL CHECK(amount_paise>0),
 status text NOT NULL CHECK(status IN ('requested','pending','processed','failed')),
 requested_by text REFERENCES "user"(id), failure_reason text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id text REFERENCES "user"(id) ON DELETE SET NULL,
 action text NOT NULL, subject_type text NOT NULL, subject_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
ALTER TABLE "user" ADD CONSTRAINT user_role_check CHECK (role IN ('traveler','support','operator','admin'));
COMMIT;
