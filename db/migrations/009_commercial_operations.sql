BEGIN;
CREATE TABLE IF NOT EXISTS support_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL, subject text NOT NULL CHECK(length(subject) BETWEEN 5 AND 160),
 category text NOT NULL CHECK(category IN ('booking','payment','refund','other')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','waiting','resolved','closed')),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent')),
 assigned_to text REFERENCES "user"(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_cases_user_idx ON support_cases(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS support_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
 author_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT, body text NOT NULL CHECK(length(body) BETWEEN 2 AND 5000),
 internal boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_case_idx ON support_messages(case_id,created_at);
CREATE TABLE IF NOT EXISTS suppliers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, kind text NOT NULL CHECK(kind IN ('stay','guide','transport','activity')),
 contact_email text, contact_phone text, location text, notes text,
 status text NOT NULL DEFAULT 'review' CHECK(status IN ('review','approved','suspended')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS booking_suppliers (
 booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
 supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
 confirmation_reference text NOT NULL,
 confirmed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(booking_id,supplier_id)
);
CREATE TABLE IF NOT EXISTS commercial_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('invoice','voucher')), document_number text UNIQUE NOT NULL,
 snapshot jsonb NOT NULL, issued_by text NOT NULL REFERENCES "user"(id), issued_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(booking_id,kind)
);
CREATE SEQUENCE IF NOT EXISTS commercial_document_number_seq;
CREATE TABLE IF NOT EXISTS email_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 event_key text NOT NULL UNIQUE, template text NOT NULL CHECK(template IN ('quote_ready','payment_captured','booking_confirmed','support_reply','document_issued')),
 subject text NOT NULL, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','skipped')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz,
 provider_message_id text, last_error text, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS email_outbox_pending_idx ON email_outbox(available_at) WHERE sent_at IS NULL;
COMMIT;
