CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text,
  "role" text NOT NULL DEFAULT 'traveler',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_user_id_idx ON "session"("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("providerId", "accountId")
);
CREATE INDEX IF NOT EXISTS account_user_id_idx ON "account"("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON "verification"("identifier");

CREATE TABLE IF NOT EXISTS traveler_profiles (
  user_id text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  display_name text,
  phone text,
  city text,
  state text,
  country text NOT NULL DEFAULT 'India',
  bio text,
  travel_style text,
  accessibility_notes text,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS traveler_settings (
  user_id text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  email_trip_updates boolean NOT NULL DEFAULT true,
  email_offers boolean NOT NULL DEFAULT false,
  product_updates boolean NOT NULL DEFAULT true,
  profile_visibility text NOT NULL DEFAULT 'private' CHECK (profile_visibility IN ('private','companions')),
  preferred_language text NOT NULL DEFAULT 'English',
  preferred_currency text NOT NULL DEFAULT 'INR',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  destination_id text NOT NULL,
  destination_name text NOT NULL,
  days integer NOT NULL CHECK (days BETWEEN 1 AND 60),
  travelers integer NOT NULL CHECK (travelers BETWEEN 1 AND 30),
  travel_style text NOT NULL,
  departure_date date,
  budget_per_person_paise bigint NOT NULL CHECK (budget_per_person_paise >= 0),
  notes text,
  status text NOT NULL DEFAULT 'consultation_requested' CHECK (status IN ('consultation_requested','consultation_scheduled','quotation_ready','advance_paid','confirmed','completed','cancelled')),
  quote_total_paise bigint CHECK (quote_total_paise >= 0),
  advance_percent integer NOT NULL DEFAULT 25 CHECK (advance_percent BETWEEN 1 AND 100),
  quote_notes text,
  quote_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_user_created_idx ON bookings(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  razorpay_order_id text NOT NULL UNIQUE,
  razorpay_payment_id text UNIQUE,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','authorized','captured','failed','refunded','refund_pending')),
  signature_verified boolean NOT NULL DEFAULT false,
  failure_reason text,
  captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_user_created_idx ON payments(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  kind text NOT NULL DEFAULT 'account',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON user_notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS "rateLimit" ("id" text PRIMARY KEY,"key" text NOT NULL UNIQUE,"count" integer NOT NULL,"lastRequest" bigint NOT NULL);
