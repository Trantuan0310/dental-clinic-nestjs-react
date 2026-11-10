CREATE TABLE treatment_plan_contacts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  plan_id uuid NOT NULL REFERENCES treatment_plans(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  channel varchar(10) NOT NULL CHECK(channel IN ('PHONE','SMS','ZALO','EMAIL','DESK')),
  outcome varchar(16) NOT NULL CHECK(outcome IN ('REACHED','CALL_BACK','DECLINED','UNREACHABLE')),
  contacted_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);
CREATE INDEX treatment_plan_contacts_plan_id_contacted_at_idx ON treatment_plan_contacts(plan_id, contacted_at);
