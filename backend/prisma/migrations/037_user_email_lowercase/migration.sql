-- For the admin, after this migration (NOTICEs name the rows left alone):
--   -- active accounts whose emails differ only in case
--   SELECT lower(email) AS email, array_agg(id) AS ids, array_agg(email) AS spellings
--     FROM users WHERE deactivated_at IS NULL AND deleted_at IS NULL
--    GROUP BY lower(email) HAVING count(*) > 1;
--   -- once each group is down to one active account (change or deactivate the others):
--   UPDATE users SET email = lower(email) WHERE email <> lower(email);  -- only rows now unique
--   CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_active_key"
--     ON "users" (lower("email")) WHERE "deactivated_at" IS NULL AND "deleted_at" IS NULL;
-- Until then login and "forgot password" still find such an account by a
-- case-insensitive match, but only while exactly one active account matches.
--
-- Login emails become case-insensitive. The app lowercases every login email
-- it writes and every email it looks up (login, forgot password, create/edit
-- user, link account); this migration lowercases the rows already stored and
-- adds a unique index on lower(email) with the same partial scope as
-- users_email_active_key (migration 013): active rows only, so a deactivated
-- account's email stays reusable.
--
-- Never fails on existing data: a row whose lowercase email would collide with
-- another active account keeps its current spelling and is reported with
-- RAISE NOTICE, and the lower(email) index is only created once no active
-- duplicates remain (rerun the DO block below after fixing them by hand).

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, email, (deactivated_at IS NULL AND deleted_at IS NULL) AS is_active
    FROM users
    WHERE email <> lower(email)
    ORDER BY created_at
  LOOP
    IF r.is_active AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id <> r.id
        AND lower(u.email) = lower(r.email)
        AND u.deactivated_at IS NULL
        AND u.deleted_at IS NULL
    ) THEN
      RAISE NOTICE 'users.email % (id %) kept as is: another active account uses the same email in another case',
        r.email, r.id;
    ELSE
      UPDATE users SET email = lower(email) WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  dup RECORD;
  has_dups BOOLEAN := FALSE;
BEGIN
  FOR dup IN
    SELECT lower(email) AS email, count(*) AS n
    FROM users
    WHERE deactivated_at IS NULL AND deleted_at IS NULL
    GROUP BY lower(email)
    HAVING count(*) > 1
  LOOP
    has_dups := TRUE;
    RAISE NOTICE 'Active accounts share the email % (% rows); users_email_lower_active_key not created',
      dup.email, dup.n;
  END LOOP;

  IF NOT has_dups THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_active_key"
      ON "users" (lower("email"))
      WHERE "deactivated_at" IS NULL AND "deleted_at" IS NULL;
  END IF;
END $$;
