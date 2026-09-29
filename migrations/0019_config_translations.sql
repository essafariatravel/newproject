-- Additive editorial translations. Existing English/default names and all
-- application/fee snapshots remain unchanged; no automatic content rewrite.
ALTER TABLE visa_categories ADD COLUMN IF NOT EXISTS name_fr text, ADD COLUMN IF NOT EXISTS name_ar text,
  ADD COLUMN IF NOT EXISTS description_fr text, ADD COLUMN IF NOT EXISTS description_ar text;
ALTER TABLE visa_types ADD COLUMN IF NOT EXISTS name_fr text, ADD COLUMN IF NOT EXISTS name_ar text,
  ADD COLUMN IF NOT EXISTS description_fr text, ADD COLUMN IF NOT EXISTS description_ar text;
ALTER TABLE document_types ADD COLUMN IF NOT EXISTS name_fr text, ADD COLUMN IF NOT EXISTS name_ar text,
  ADD COLUMN IF NOT EXISTS description_fr text, ADD COLUMN IF NOT EXISTS description_ar text;
