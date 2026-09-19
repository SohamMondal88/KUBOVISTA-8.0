CREATE TABLE IF NOT EXISTS journal_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text REFERENCES "user"(id) ON DELETE SET NULL,
 author_name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('traveler','company','instagram')),
 title text NOT NULL,
 summary text NOT NULL,
 body text NOT NULL,
 instagram_url text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz
);
CREATE INDEX IF NOT EXISTS journal_public_idx ON journal_posts(status,published_at DESC);
CREATE INDEX IF NOT EXISTS journal_author_idx ON journal_posts(user_id,created_at DESC);
