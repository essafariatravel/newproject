-- A registration email may only be used once, for any historic or future status.
-- Existing duplicate registrations remain untouched, including audit trails.
-- Unique indexes cannot be created safely while historic duplicates exist.
-- This BEFORE trigger serializes concurrent inserts and blocks any NEW repeats
-- without changing, deleting, or locking historical applications.
CREATE OR REPLACE FUNCTION agency_registration_email_once_guard()
RETURNS trigger LANGUAGE plpgsql
AS $registration_email_once$
DECLARE
  canonical_email text;
  already_registered boolean;
BEGIN
  canonical_email := lower(btrim(NEW.email));
  IF canonical_email IS NULL OR canonical_email = '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF canonical_email = lower(btrim(OLD.email)) THEN RETURN NEW; END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('evos:registration-email'), hashtext(canonical_email));
  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %I.agency_registrations WHERE lower(btrim(email)) = $1 AND id <> $2)',
    TG_TABLE_SCHEMA
  ) INTO already_registered USING canonical_email, NEW.id;
  IF already_registered THEN
    RAISE EXCEPTION 'A registration with this email already exists'
      USING ERRCODE = '23505', CONSTRAINT = 'agency_registration_email_once';
  END IF;
  RETURN NEW;
END
$registration_email_once$;

DROP TRIGGER IF EXISTS agency_registration_email_once ON agency_registrations;
CREATE TRIGGER agency_registration_email_once
  BEFORE INSERT OR UPDATE OF email ON agency_registrations
  FOR EACH ROW EXECUTE FUNCTION agency_registration_email_once_guard();
