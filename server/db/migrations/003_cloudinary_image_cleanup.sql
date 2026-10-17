CREATE TABLE IF NOT EXISTS pending_cloudinary_image_deletions (
  provider_public_id TEXT PRIMARY KEY,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pending_cloudinary_image_deletions_queued_idx
  ON pending_cloudinary_image_deletions(queued_at);
