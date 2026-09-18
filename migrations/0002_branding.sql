-- 0002_branding.sql
-- White-label branding: per-agency logo (stored via the pluggable storage
-- provider; key + mime cached on the row for cheap header rendering).

alter table "agencies" add column if not exists "logo_key" text;
alter table "agencies" add column if not exists "logo_mime" text;
alter table "agencies" add column if not exists "logo_uploaded_at" timestamptz;
