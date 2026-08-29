-- uuid_generate_v7(): RFC 9562 UUID v7 implementation
-- 48-bit unix_ts_ms + 4-bit ver (7) + 12-bit rand_a + 2-bit var (10) + 62-bit rand_b
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