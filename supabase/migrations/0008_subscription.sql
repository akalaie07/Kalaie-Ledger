-- 0008_subscription.sql
-- Abo-Modell: Anmeldegebühr-Optionen, wiederkehrender Preis, subscription_payments

-- 1. payment_type_enum erweitern
ALTER TYPE payment_type_enum ADD VALUE IF NOT EXISTS 'subscription_monthly';
ALTER TYPE payment_type_enum ADD VALUE IF NOT EXISTS 'subscription_yearly';

-- 2. Produkte: Abo-Preisfelder
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS registration_fee_options numeric[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS default_recurring_price numeric;

-- 3. Deals: Abo-Felder
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS recurring_amount numeric,
  ADD COLUMN IF NOT EXISTS subscription_start_date date;

-- 4. Neue Tabelle: subscription_payments
CREATE TABLE IF NOT EXISTS subscription_payments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deal_id          uuid        NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  sequence         integer     NOT NULL DEFAULT 1,
  due_date         date        NOT NULL,
  amount           numeric     NOT NULL,
  paid             boolean     NOT NULL DEFAULT false,
  paid_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage subscription_payments"
  ON subscription_payments
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );
