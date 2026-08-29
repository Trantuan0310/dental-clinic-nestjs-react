-- Extensions required by the Dental Clinic backend.
-- Loaded at first volume init via /docker-entrypoint-initdb.d/01-extensions.sql.
-- See docs/05_ADR/ADR-0005-uuid-v7.md for the rationale on the custom uuid_generate_v7.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;