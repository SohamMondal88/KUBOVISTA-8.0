CREATE TABLE IF NOT EXISTS business_enquiries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('contact','career','sponsor','partnership','stay','equipment')),
 name text NOT NULL,
 email text NOT NULL,
 organization text,
 message text NOT NULL,
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enquiries_email_created ON business_enquiries(email,created_at DESC);
