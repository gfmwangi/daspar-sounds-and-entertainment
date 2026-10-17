CREATE TABLE IF NOT EXISTS admin_setup_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
  setup_completed_at TIMESTAMPTZ,
  recovery_key_hash CHAR(64),
  recovery_key_ciphertext TEXT,
  CHECK ((recovery_key_hash IS NULL) = (recovery_key_ciphertext IS NULL))
);

INSERT INTO admin_setup_state(singleton, setup_completed_at, recovery_key_hash, recovery_key_ciphertext)
VALUES(TRUE, NULL, NULL, NULL)
ON CONFLICT(singleton) DO NOTHING;
