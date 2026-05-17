-- mahnung_required was missing from the deals table
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS mahnung_required boolean NOT NULL DEFAULT false;
