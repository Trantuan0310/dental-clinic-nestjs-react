BEGIN;
-- What a patient sees about a dentist before booking online: title, position,
-- the year they started practising (years of experience are counted from it),
-- training, career and awards (one item per line).
ALTER TABLE dentist_profiles
  ADD COLUMN title VARCHAR(50),
  ADD COLUMN position VARCHAR(150),
  ADD COLUMN practice_since SMALLINT CHECK (practice_since BETWEEN 1950 AND 2100),
  ADD COLUMN education TEXT,
  ADD COLUMN experience TEXT,
  ADD COLUMN awards TEXT;

-- A patient's rating of the dentist who saw them, one per closed visit, given
-- through the patient's history link. Staff may hide a review (with a reason);
-- hidden reviews are not shown or counted publicly.
CREATE TYPE "DentistReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN');
CREATE TABLE dentist_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  dentist_id UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON UPDATE CASCADE,
  encounter_id UUID NOT NULL UNIQUE REFERENCES encounters(id) ON UPDATE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment VARCHAR(1000),
  status "DentistReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
  hidden_reason VARCHAR(300),
  hidden_by UUID,
  hidden_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dentist_reviews_dentist_status_idx ON dentist_reviews(dentist_id, status, created_at DESC);
COMMIT;
