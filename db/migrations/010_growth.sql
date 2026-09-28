BEGIN;
CREATE TABLE IF NOT EXISTS editorial_pages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL CHECK(slug ~ '^[a-z0-9-]{3,80}$'), locale text NOT NULL CHECK(locale IN ('en','hi','bn')),
 title text NOT NULL CHECK(length(title) BETWEEN 5 AND 150), summary text NOT NULL CHECK(length(summary) BETWEEN 20 AND 350), body text NOT NULL CHECK(length(body) BETWEEN 80 AND 15000),
 region text, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 sponsored boolean NOT NULL DEFAULT false, sponsor_name text,
 author_id text NOT NULL REFERENCES "user"(id), reviewed_by text REFERENCES "user"(id), published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(slug,locale),
 CHECK(NOT sponsored OR length(coalesce(sponsor_name,''))>=2)
);
CREATE INDEX IF NOT EXISTS editorial_public_idx ON editorial_pages(locale,published_at DESC) WHERE status='published';
CREATE TABLE IF NOT EXISTS traveler_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id), user_id text NOT NULL REFERENCES "user"(id),
 rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5), title text NOT NULL CHECK(length(title) BETWEEN 5 AND 100), body text NOT NULL CHECK(length(body) BETWEEN 40 AND 3000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
 moderated_by text REFERENCES "user"(id), moderation_note text, created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz
);
CREATE INDEX IF NOT EXISTS traveler_reviews_public_idx ON traveler_reviews(published_at DESC) WHERE status='published';
ALTER TABLE booking_suppliers ADD COLUMN IF NOT EXISTS supplier_response text NOT NULL DEFAULT 'pending' CHECK(supplier_response IN ('pending','accepted','declined'));
ALTER TABLE booking_suppliers ADD COLUMN IF NOT EXISTS supplier_response_at timestamptz;
CREATE TABLE IF NOT EXISTS supplier_accounts (
 supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(supplier_id,user_id)
);
CREATE TABLE IF NOT EXISTS affiliate_placements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, provider text NOT NULL,
 category text NOT NULL, title text NOT NULL, description text NOT NULL, url text NOT NULL,
 approval_reference text NOT NULL, status text NOT NULL DEFAULT 'review' CHECK(status IN ('review','active','paused')),
 created_by text NOT NULL REFERENCES "user"(id), reviewed_by text REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS membership_interests (
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, plan text NOT NULL CHECK(plan IN ('plus','circle')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,plan)
);
COMMIT;
