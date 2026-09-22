CREATE TABLE IF NOT EXISTS travel_date_trips (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 display_name text NOT NULL,
 destination text NOT NULL,
 style text NOT NULL CHECK(style IN ('solo','couples','friends','family','students')),
 title text NOT NULL, description text NOT NULL,
 start_date date NOT NULL, end_date date NOT NULL CHECK(end_date>=start_date),
 budget integer NOT NULL CHECK(budget BETWEEN 500 AND 500000),
 seats integer NOT NULL CHECK(seats BETWEEN 1 AND 8),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected','closed')),
 adult_attested_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
 reviewed_by text REFERENCES "user"(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS travel_date_public ON travel_date_trips(status,start_date);
CREATE INDEX IF NOT EXISTS travel_date_owner ON travel_date_trips(user_id,created_at);
CREATE TABLE IF NOT EXISTS travel_date_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 trip_id uuid NOT NULL REFERENCES travel_date_trips(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 display_name text NOT NULL, message text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(trip_id,user_id)
);
CREATE TABLE IF NOT EXISTS travel_date_blocks (
 blocker_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 blocked_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id)
);
CREATE TABLE IF NOT EXISTS travel_date_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 trip_id uuid NOT NULL REFERENCES travel_date_trips(id) ON DELETE CASCADE,
 reporter_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(reason IN ('scam','harassment','contact','underage','other')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(trip_id,reporter_id)
);
