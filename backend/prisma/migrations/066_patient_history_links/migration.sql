BEGIN;
-- Links a patient opens to read their own visit history (no account needed).
-- Only the SHA-256 of the token is stored.
CREATE TABLE patient_history_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON UPDATE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX patient_history_links_patient_id_idx ON patient_history_links(patient_id);
COMMIT;
