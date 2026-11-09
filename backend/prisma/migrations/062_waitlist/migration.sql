CREATE TABLE waitlist_entries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(), patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT ON UPDATE CASCADE, dentist_id uuid REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  from_date date NOT NULL, to_date date NOT NULL CHECK(to_date >= from_date),
  period text NOT NULL CHECK(period IN ('ANY','AM','PM')), note text,
  status text NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING','BOOKED','REMOVED')),
  appointment_id uuid UNIQUE REFERENCES appointments(id) ON DELETE SET NULL ON UPDATE CASCADE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX waitlist_match_idx ON waitlist_entries(status,service_id,from_date,to_date);
