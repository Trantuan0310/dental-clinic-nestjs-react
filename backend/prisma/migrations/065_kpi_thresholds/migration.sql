BEGIN;
CREATE TABLE kpi_thresholds (
  key varchar(32) PRIMARY KEY,
  target double precision NOT NULL,
  ok_at double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CHECK (key IN ('noShowRate','rebookRate','planAcceptance','medianWait','lateCancelRate','collectionRate')),
  CHECK (target >= 0 AND ok_at >= 0 AND target <= CASE WHEN key = 'medianWait' THEN 480 ELSE 100 END
    AND ok_at <= CASE WHEN key = 'medianWait' THEN 480 ELSE 100 END),
  CHECK (CASE WHEN key IN ('noShowRate','medianWait','lateCancelRate') THEN target <= ok_at ELSE target >= ok_at END)
);
INSERT INTO kpi_thresholds (key,target,ok_at) VALUES
  ('noShowRate',5,10), ('rebookRate',85,70), ('planAcceptance',75,60),
  ('medianWait',15,30), ('lateCancelRate',5,10), ('collectionRate',95,85);
COMMIT;
