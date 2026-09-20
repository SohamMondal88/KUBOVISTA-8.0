CREATE TABLE IF NOT EXISTS kubo_usage (
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 usage_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
 requests integer NOT NULL DEFAULT 1 CHECK(requests BETWEEN 1 AND 30),
 last_request_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,usage_day)
);
