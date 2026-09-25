BEGIN;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS firebase_uid text UNIQUE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
CREATE TABLE IF NOT EXISTS firebase_devices (
 token_hash text PRIMARY KEY,
 token text NOT NULL,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS firebase_devices_user_idx ON firebase_devices(user_id);
CREATE TABLE IF NOT EXISTS firebase_push_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 notification_id uuid NOT NULL REFERENCES user_notifications(id) ON DELETE CASCADE,
 token_hash text NOT NULL REFERENCES firebase_devices(token_hash) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz,
 sent_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(notification_id,token_hash)
);
CREATE INDEX IF NOT EXISTS firebase_push_pending_idx ON firebase_push_deliveries(available_at) WHERE sent_at IS NULL;
CREATE OR REPLACE FUNCTION queue_firebase_notification() RETURNS trigger AS $$
BEGIN
 INSERT INTO firebase_push_deliveries(notification_id,token_hash,user_id)
 SELECT NEW.id,token_hash,NEW.user_id FROM firebase_devices WHERE user_id=NEW.user_id AND updated_at>now()-interval '30 days'
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS firebase_notification_insert ON user_notifications;
CREATE TRIGGER firebase_notification_insert AFTER INSERT ON user_notifications FOR EACH ROW EXECUTE FUNCTION queue_firebase_notification();
COMMIT;
