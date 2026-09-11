-- One-time setup for using a native (non-Docker) PostgreSQL instance.
-- Run as: psql -U postgres -h 127.0.0.1 -p 5432 -f scripts/setup-native-db.sql
-- (it will prompt for your postgres password interactively)

CREATE DATABASE dental_clinic;

\connect dental_clinic

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.uuid_generate_v7() RETURNS uuid
LANGUAGE plpgsql VOLATILE PARALLEL SAFE AS $$
DECLARE
  ts_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  b bytea;
BEGIN
  b := gen_random_bytes(16);
  b := set_byte(b, 0, ((ts_ms >> 40) & 255)::int);
  b := set_byte(b, 1, ((ts_ms >> 32) & 255)::int);
  b := set_byte(b, 2, ((ts_ms >> 24) & 255)::int);
  b := set_byte(b, 3, ((ts_ms >> 16) & 255)::int);
  b := set_byte(b, 4, ((ts_ms >> 8) & 255)::int);
  b := set_byte(b, 5, (ts_ms & 255)::int);
  b := set_byte(b, 6, ((7 << 4) | (get_byte(b, 6) & 15))::int);
  b := set_byte(b, 8, ((2 << 6) | (get_byte(b, 8) & 63))::int);
  RETURN encode(b, 'hex')::uuid;
END;
$$;

SELECT uuid_generate_v7() AS smoke_test;
