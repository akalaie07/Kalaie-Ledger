-- Add storniert (cancelled) field to deals, separate from chargeback (payment reversal)
ALTER TABLE deals ADD COLUMN IF NOT EXISTS storniert boolean NOT NULL DEFAULT false;
