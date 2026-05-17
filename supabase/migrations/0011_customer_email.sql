-- Add customer_email to deals for better fuzzy-matching during import
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS customer_email text;
